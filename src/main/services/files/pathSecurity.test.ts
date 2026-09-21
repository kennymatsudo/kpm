import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createTestConfig, setConfig } from '../../config';
import {
  checkExternalTargetAllowed,
  checkRealpathAccess,
  expandTilde,
  getDeniedPathRoots,
  isGitHooksPath,
  pathCanTraverseDeniedRoot,
  pathResolvesIntoDeniedRoot,
} from './pathSecurity';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kpm-pathsec-'));
  setConfig(createTestConfig({}));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  setConfig(createTestConfig({}));
});

describe('expandTilde', () => {
  it('expands a bare ~ to the home directory', () => {
    expect(expandTilde('~')).toBe(os.homedir());
  });

  it('expands ~/ prefixes', () => {
    expect(expandTilde('~/.ssh/id_rsa')).toBe(path.join(os.homedir(), '.ssh', 'id_rsa'));
  });

  it('leaves absolute and relative paths untouched', () => {
    expect(expandTilde('/etc/passwd')).toBe('/etc/passwd');
    expect(expandTilde('src/foo.ts')).toBe('src/foo.ts');
    expect(expandTilde('~notuser/thing')).toBe('~notuser/thing');
  });
});

describe('pathResolvesIntoDeniedRoot', () => {
  it('denies default credential roots even when addressed via ~', async () => {
    expect(await pathResolvesIntoDeniedRoot('~/.ssh/id_rsa')).toBe(true);
    expect(await pathResolvesIntoDeniedRoot('~/.aws/credentials')).toBe(true);
    expect(await pathResolvesIntoDeniedRoot(path.join(os.homedir(), '.gnupg', 'secring'))).toBe(true);
  });

  it('allows ordinary paths outside any denied root', async () => {
    const file = path.join(tmpRoot, 'src', 'index.ts');
    expect(await pathResolvesIntoDeniedRoot(file)).toBe(false);
  });

  it('honors a user-configured extra denied root', async () => {
    const secretDir = path.join(tmpRoot, 'vault');
    fs.mkdirSync(secretDir, { recursive: true });
    setConfig(createTestConfig({ fileExplorer: { deniedRealpathRoots: [secretDir] } }));

    expect(await pathResolvesIntoDeniedRoot(path.join(secretDir, 'token'))).toBe(true);
    expect(await pathResolvesIntoDeniedRoot(path.join(tmpRoot, 'other', 'token'))).toBe(false);
  });

  it('resolves a relative candidate against the provided base directory', async () => {
    const secretDir = path.join(tmpRoot, 'creds');
    fs.mkdirSync(secretDir, { recursive: true });
    setConfig(createTestConfig({ fileExplorer: { deniedRealpathRoots: [secretDir] } }));

    expect(await pathResolvesIntoDeniedRoot('token', secretDir)).toBe(true);
    expect(await pathResolvesIntoDeniedRoot('token', tmpRoot)).toBe(false);
  });
});

describe('pathCanTraverseDeniedRoot', () => {
  it('detects both a protected path and a traversal root containing one', async () => {
    const secretDir = path.join(tmpRoot, 'workspace', 'credentials');
    fs.mkdirSync(secretDir, { recursive: true });
    setConfig(createTestConfig({ fileExplorer: { deniedRealpathRoots: [secretDir] } }));

    expect(await pathCanTraverseDeniedRoot(path.join(secretDir, 'token'))).toBe(true);
    expect(await pathCanTraverseDeniedRoot(path.join(tmpRoot, 'workspace'))).toBe(true);
    expect(await pathCanTraverseDeniedRoot(path.join(tmpRoot, 'other'))).toBe(false);
  });
});

describe('getDeniedPathRoots', () => {
  it('includes both configured symlink paths and their real targets', () => {
    const realRoot = path.join(tmpRoot, 'real-credentials');
    const linkedRoot = path.join(tmpRoot, 'linked-credentials');
    fs.mkdirSync(realRoot);
    fs.symlinkSync(realRoot, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
    setConfig(createTestConfig({ fileExplorer: { deniedRealpathRoots: [linkedRoot] } }));

    expect(getDeniedPathRoots()).toEqual(expect.arrayContaining([linkedRoot, fs.realpathSync(linkedRoot)]));
  });
});

describe('isGitHooksPath', () => {
  it('flags paths inside a .git/hooks directory', () => {
    expect(isGitHooksPath('/repo/.git/hooks/pre-commit')).toBe(true);
    expect(isGitHooksPath('/repo/.git/hooks')).toBe(true);
  });

  it('does not flag unrelated hooks-named paths', () => {
    expect(isGitHooksPath('/repo/src/hooks/useThing.ts')).toBe(false);
    expect(isGitHooksPath('/repo/.github/hooks/thing')).toBe(false);
    expect(isGitHooksPath('/repo/.git/config')).toBe(false);
  });
});

describe('checkRealpathAccess', () => {
  it('denies a target that resolves inside a configured protected location', async () => {
    const secretDir = path.join(tmpRoot, 'vault');
    fs.mkdirSync(secretDir, { recursive: true });
    setConfig(createTestConfig({ fileExplorer: { deniedRealpathRoots: [secretDir] } }));

    const result = await checkRealpathAccess(path.join(secretDir, 'token'), tmpRoot);

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/protected location/i);
  });

  it('flags a realpath outside the project root as external but still allowed', async () => {
    const projectFolder = path.join(tmpRoot, 'project');
    const outside = path.join(tmpRoot, 'elsewhere', 'file.txt');
    fs.mkdirSync(projectFolder, { recursive: true });

    const result = await checkRealpathAccess(outside, projectFolder);

    expect(result.allowed).toBe(true);
    expect(result.external).toBe(true);
  });

  it('marks a realpath inside the project root as not external', async () => {
    const projectFolder = path.join(tmpRoot, 'project');
    fs.mkdirSync(projectFolder, { recursive: true });

    const result = await checkRealpathAccess(path.join(projectFolder, 'src', 'index.ts'), projectFolder);

    expect(result.allowed).toBe(true);
    expect(result.external).toBe(false);
  });
});

describe('checkExternalTargetAllowed', () => {
  it('denies a target that resolves inside a protected location', async () => {
    const secretDir = path.join(tmpRoot, 'vault');
    fs.mkdirSync(secretDir, { recursive: true });
    setConfig(createTestConfig({ fileExplorer: { deniedRealpathRoots: [secretDir] } }));

    const result = await checkExternalTargetAllowed(path.join(secretDir, 'token'));

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/protected location/i);
  });

  it('allows an ordinary target outside any denied root', async () => {
    const result = await checkExternalTargetAllowed(path.join(tmpRoot, 'downloads', 'file.txt'));
    expect(result.allowed).toBe(true);
  });
});

describe('checkRealpathAccess git-hooks write scoping', () => {
  it('denies a .git/hooks target only when denyGitHooksWrite is set', async () => {
    const hookPath = path.join(tmpRoot, '.git', 'hooks', 'pre-commit');

    const read = await checkRealpathAccess(hookPath, tmpRoot);
    expect(read.allowed).toBe(true);

    const write = await checkRealpathAccess(hookPath, tmpRoot, { denyGitHooksWrite: true });
    expect(write.allowed).toBe(false);
    expect(write.reason).toMatch(/git hooks/i);
  });

  it('still allows ordinary writes when denyGitHooksWrite is set', async () => {
    const file = path.join(tmpRoot, 'src', 'index.ts');
    const write = await checkRealpathAccess(file, tmpRoot, { denyGitHooksWrite: true });
    expect(write.allowed).toBe(true);
  });
});
