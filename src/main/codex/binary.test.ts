import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

const appMocks = vi.hoisted(() => ({
  getAppPath: vi.fn(),
  isPackaged: false,
}));

vi.mock('electron', () => ({
  app: appMocks,
}));

import { findCodexBinaryPath } from './binary';

interface CurrentCodexTarget {
  targetTriple: string;
  platformPackage: string;
  binaryName: string;
}

function getCurrentCodexTarget(): CurrentCodexTarget {
  const { platform, arch } = process;
  if (platform === 'darwin') {
    return {
      targetTriple: arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin',
      platformPackage: arch === 'arm64' ? '@openai/codex-darwin-arm64' : '@openai/codex-darwin-x64',
      binaryName: 'codex',
    };
  }
  if (platform === 'linux') {
    return {
      targetTriple: arch === 'arm64' ? 'aarch64-unknown-linux-musl' : 'x86_64-unknown-linux-musl',
      platformPackage: arch === 'arm64' ? '@openai/codex-linux-arm64' : '@openai/codex-linux-x64',
      binaryName: 'codex',
    };
  }
  if (platform === 'win32') {
    return {
      targetTriple: arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc',
      platformPackage: arch === 'arm64' ? '@openai/codex-win32-arm64' : '@openai/codex-win32-x64',
      binaryName: 'codex.exe',
    };
  }
  throw new Error(`Unsupported platform: ${platform} (${arch})`);
}

function touchFile(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, '');
}

function codexBinaryPath(root: string, leafDir: 'bin' | 'codex'): string {
  const target = getCurrentCodexTarget();
  return join(
    root,
    'node_modules',
    target.platformPackage,
    'vendor',
    target.targetTriple,
    leafDir,
    target.binaryName,
  );
}

describe('findCodexBinaryPath', () => {
  let appRoot: string;

  beforeEach(() => {
    appRoot = join(tmpdir(), `kpm-codex-binary-${randomUUID()}`);
    appMocks.getAppPath.mockReturnValue(appRoot);
    appMocks.isPackaged = false;
  });

  afterEach(() => {
    rmSync(appRoot, { recursive: true, force: true });
  });

  it('uses the current SDK vendored bin path', () => {
    const binaryPath = codexBinaryPath(appRoot, 'bin');
    touchFile(binaryPath);

    expect(findCodexBinaryPath()).toBe(binaryPath);
  });

  it('falls back to the legacy vendored codex path', () => {
    const binaryPath = codexBinaryPath(appRoot, 'codex');
    touchFile(binaryPath);

    expect(findCodexBinaryPath()).toBe(binaryPath);
  });

  it('uses app.asar.unpacked for packaged apps', () => {
    const asarRoot = join(appRoot, 'app.asar');
    const unpackedRoot = join(appRoot, 'app.asar.unpacked');
    const binaryPath = codexBinaryPath(unpackedRoot, 'bin');
    appMocks.getAppPath.mockReturnValue(asarRoot);
    appMocks.isPackaged = true;
    touchFile(binaryPath);

    expect(findCodexBinaryPath()).toBe(binaryPath);
  });

  it('throws a targeted error when the binary is missing', () => {
    const target = getCurrentCodexTarget();

    expect(() => findCodexBinaryPath()).toThrow(
      new RegExp(`Unable to locate Codex CLI binary for ${target.targetTriple}`)
    );
  });
});
