import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  checkExternalTargetAllowed,
  checkRealpathAccess,
  resolveBestEffortRealpath,
} from '../../src/main/services/files/pathSecurity';
import { createTestConfig, setConfig } from '../../src/main/config';

let tempRoots: string[] = [];

function mkTemp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

beforeEach(() => {
  setConfig(createTestConfig({}));
});

afterEach(() => {
  for (const dir of tempRoots) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
  tempRoots = [];
});

describe('resolveBestEffortRealpath', () => {
  it('resolves through a symlink for an existing target', async () => {
    const real = mkTemp('ps-real-');
    const linkParent = mkTemp('ps-link-');
    const link = path.join(linkParent, 'aliased');
    fs.symlinkSync(real, link);

    const resolved = await resolveBestEffortRealpath(link);
    expect(resolved).toBe(fs.realpathSync.native(real));
  });

  it('walks up to the nearest existing ancestor for a yet-to-be-created path', async () => {
    const project = mkTemp('ps-proj-');
    const resolved = await resolveBestEffortRealpath(path.join(project, 'new', 'file.md'));
    expect(resolved).toBe(path.join(fs.realpathSync.native(project), 'new', 'file.md'));
  });
});

describe('checkRealpathAccess', () => {
  it('classifies an in-project path as not external and allowed', async () => {
    const project = mkTemp('ps-proj-');
    fs.writeFileSync(path.join(project, 'notes.md'), 'hi', 'utf-8');

    const result = await checkRealpathAccess(path.join(project, 'notes.md'), project);
    expect(result.allowed).toBe(true);
    expect(result.external).toBe(false);
  });

  it('classifies a symlink that points outside as external but allowed by default', async () => {
    const project = mkTemp('ps-proj-');
    const outside = mkTemp('ps-out-');
    fs.writeFileSync(path.join(outside, 'shared.md'), 'hi', 'utf-8');
    fs.symlinkSync(path.join(outside, 'shared.md'), path.join(project, 'shared.md'));

    const result = await checkRealpathAccess(path.join(project, 'shared.md'), project);
    expect(result.allowed).toBe(true);
    expect(result.external).toBe(true);
    expect(result.realpath).toBe(fs.realpathSync.native(path.join(outside, 'shared.md')));
  });

  it('blocks ops whose realpath lands inside a denied root (extra config entry)', async () => {
    const project = mkTemp('ps-proj-');
    const protectedRoot = mkTemp('ps-secrets-');
    fs.writeFileSync(path.join(protectedRoot, 'id_rsa'), 'fake', 'utf-8');
    setConfig(createTestConfig({ fileExplorer: { deniedRealpathRoots: [protectedRoot] } }));

    fs.symlinkSync(path.join(protectedRoot, 'id_rsa'), path.join(project, 'id_rsa'));
    const result = await checkRealpathAccess(path.join(project, 'id_rsa'), project);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('protected location');
    expect(result.external).toBe(true);
  });

  it('blocks ops that target a denied root via a multi-hop symlink chain', async () => {
    const project = mkTemp('ps-proj-');
    const protectedRoot = mkTemp('ps-secrets-');
    setConfig(createTestConfig({ fileExplorer: { deniedRealpathRoots: [protectedRoot] } }));

    const hop = mkTemp('ps-hop-');
    fs.symlinkSync(protectedRoot, path.join(hop, 'mid'));
    fs.symlinkSync(path.join(hop, 'mid'), path.join(project, 'creds'));

    const result = await checkRealpathAccess(path.join(project, 'creds', 'anything'), project);
    expect(result.allowed).toBe(false);
  });
});

describe('checkExternalTargetAllowed', () => {
  it('allows a normal external target', async () => {
    const outside = mkTemp('ps-out-');
    const result = await checkExternalTargetAllowed(outside);
    expect(result.allowed).toBe(true);
  });

  it('rejects a target inside a denied root', async () => {
    const protectedRoot = mkTemp('ps-secrets-');
    setConfig(createTestConfig({ fileExplorer: { deniedRealpathRoots: [protectedRoot] } }));

    const result = await checkExternalTargetAllowed(path.join(protectedRoot, 'inside'));
    expect(result.allowed).toBe(false);
  });
});
