import { app } from 'electron';
import { join } from 'path';

/**
 * Resolve the path to the vendored codex binary.
 *
 * The SDK normally resolves this via import.meta.url, but when bundled by
 * electron-vite the base directory shifts to dist/main/ and require.resolve
 * can't find the platform package. We resolve it from node_modules directly.
 *
 *
 * - Dev: app.getAppPath() = project root -> node_modules/@openai/codex-<platform>/vendor/...
 * - Packaged: binaries are in app.asar.unpacked (configured in electron-builder.yml)
 */
const PLATFORM_PACKAGE_BY_TARGET: Record<string, string> = {
  'x86_64-unknown-linux-musl': '@openai/codex-linux-x64',
  'aarch64-unknown-linux-musl': '@openai/codex-linux-arm64',
  'x86_64-apple-darwin': '@openai/codex-darwin-x64',
  'aarch64-apple-darwin': '@openai/codex-darwin-arm64',
  'x86_64-pc-windows-msvc': '@openai/codex-win32-x64',
  'aarch64-pc-windows-msvc': '@openai/codex-win32-arm64',
};

export function findCodexBinaryPath(): string {
  const { platform, arch } = process;
  let targetTriple: string;
  if (platform === 'darwin') {
    targetTriple = arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  } else if (platform === 'linux') {
    targetTriple = arch === 'arm64' ? 'aarch64-unknown-linux-musl' : 'x86_64-unknown-linux-musl';
  } else if (platform === 'win32') {
    targetTriple = arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
  } else {
    throw new Error(`Unsupported platform: ${platform} (${arch})`);
  }
  const platformPackage = PLATFORM_PACKAGE_BY_TARGET[targetTriple];
  if (!platformPackage) {
    throw new Error(`Unsupported target triple: ${targetTriple}`);
  }
  const binaryName = platform === 'win32' ? 'codex.exe' : 'codex';
  const appPath = app.getAppPath();
  // In packaged builds, spawn can't execute from inside asar; use the unpacked copy.
  const basePath = app.isPackaged
    ? appPath.replace('app.asar', 'app.asar.unpacked')
    : appPath;
}
