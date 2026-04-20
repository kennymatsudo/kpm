/**
 * Locates the bundled native Claude binary and builds SDK spawn options.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Common directories where developer CLIs live. Prepended to PATH at app
 * startup so that GUI-launched apps (which inherit a minimal PATH from
 * launchd) can still find tools spawned by shell commands and user-configured
 * stdio MCP servers.
 */
export function getCommonDevToolPaths(): string[] {
  const home = os.homedir();
  return [
    path.join(home, '.local/bin'),
    '/opt/homebrew/bin',                      // Homebrew (Apple Silicon)
    path.join(home, '.npm-global/bin'),       // npm global with custom prefix
    path.join(home, '.nvm/current/bin'),      // nvm
    path.join(home, '.fnm/current/bin'),      // fnm
  ];
}

let cachedBundledCliPath: string | undefined | null = null;

/**
 * Locate the Agent SDK's bundled native Claude binary on disk.
 *
 * SDK ≥ 0.2.x ships a native binary in a platform-specific optional package
 * (e.g. @anthropic-ai/claude-agent-sdk-darwin-arm64) instead of a cli.js
 * script. We resolve that package's `claude` binary here so we can pass an
 * explicit `pathToClaudeCodeExecutable` to the SDK.
 *
 * In a packaged Electron app, `require.resolve()` returns a path inside
 * `app.asar`. We swap the segment to `app.asar.unpacked` because native
 * binaries are extracted there by electron-builder.
 */
export function findBundledClaudeCli(): string | undefined {
  if (cachedBundledCliPath !== null) {
    return cachedBundledCliPath || undefined;
  }

  const platform = process.platform;
  const arch = process.arch;
  const ext = platform === 'win32' ? '.exe' : '';

  const candidates =
    platform === 'linux'
      ? [
          `@anthropic-ai/claude-agent-sdk-linux-${arch}-musl/claude${ext}`,
          `@anthropic-ai/claude-agent-sdk-linux-${arch}/claude${ext}`,
        ]
      : [`@anthropic-ai/claude-agent-sdk-${platform}-${arch}/claude${ext}`];

  for (const candidate of candidates) {
    try {
      const resolved = require.resolve(candidate).replace(
        /([/\\])app\.asar([/\\])/,
        '$1app.asar.unpacked$2',
      );
      if (fs.existsSync(resolved)) {
        cachedBundledCliPath = resolved;
        return resolved;
      }
    } catch {
      // package not installed — try next candidate
    }
  }

  console.warn('[findClaude] Platform-specific Claude binary not found; SDK will use system PATH');
  cachedBundledCliPath = '';
  return undefined;
}

/**
 * SDK options pointing to the bundled native Claude binary.
 *
 * The SDK ≥ 0.2.x ships a native binary (not a cli.js script), so it can be
 * spawned directly — no Electron Node runtime wrapper or ELECTRON_RUN_AS_NODE
 * needed. We only need to supply `pathToClaudeCodeExecutable` so the SDK skips
 * its own PATH lookup and uses our pinned binary.
 *
 * Returns `undefined` if the binary cannot be located; the SDK will fall back
 * to searching `claude` on PATH.
 */
export function getClaudeSdkSpawnOptions():
  | { pathToClaudeCodeExecutable: string }
  | undefined {
  const binaryPath = findBundledClaudeCli();
  if (!binaryPath) return undefined;

  return { pathToClaudeCodeExecutable: binaryPath };
}
