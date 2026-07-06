import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createTestConfig, setConfig } from '../../config';
import {
  checkRealpathAccess,
  expandTilde,
  isGitHooksPath,
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
