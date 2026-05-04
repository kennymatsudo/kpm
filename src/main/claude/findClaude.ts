/**
 * Locates the bundled native Claude binary and builds SDK spawn options.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import which from 'which';
import type { ClaudeAvailability } from '../../shared/types';

export type { ClaudeAvailability };

/**
 * Common directories where developer CLIs live. Prepended to PATH at app
 * startup so that GUI-launched apps (which inherit a minimal PATH from
 * launchd) can still find tools spawned by shell commands and user-configured
 * stdio MCP servers.
 */
export function getCommonDevToolPaths(): string[] {
  const home = os.homedir();
  const platform = process.platform;

  if (platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
    return [
      path.join(appData, 'npm'),                              // npm global (default)
      path.join(localAppData, 'Programs', 'claude'),          // Windows installer
      path.join(home, '.volta', 'bin'),                       // volta
      path.join(home, '.asdf', 'shims'),                      // asdf
      path.join(localAppData, 'mise', 'shims'),               // mise
      path.join(home, 'AppData', 'Local', 'pnpm'),            // pnpm
      path.join(home, '.yarn', 'bin'),                        // Yarn
    ];
  }

  return [
    path.join(home, '.local/bin'),
    '/usr/local/bin',                         // Homebrew (Intel Mac), npm global default
    '/opt/homebrew/bin',                      // Homebrew (Apple Silicon)
    path.join(home, '.npm-global/bin'),       // npm global with custom prefix
    path.join(home, '.nvm/current/bin'),      // nvm
    path.join(home, '.fnm/current/bin'),      // fnm
    path.join(home, '.volta/bin'),            // volta
    path.join(home, '.asdf/shims'),           // asdf
    path.join(home, '.local/share/mise/shims'), // mise (Linux/macOS default)
    path.join(home, 'Library/pnpm'),          // pnpm (macOS)
    path.join(home, '.local/share/pnpm'),     // pnpm (Linux)
    path.join(home, '.yarn/bin'),             // Yarn classic
    path.join(home, '.bun/bin'),              // Bun
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

/**
 * Verify Claude is reachable. Cheap enough to run at startup — no subprocess
 * spawn, just filesystem checks. Returns a structured status the renderer can
 * surface to the user instead of waiting for the first message to fail.
 *
 * PATH lookup uses the `which` package so we honor Windows `PATHEXT`
 * (claude.cmd / claude.ps1 from npm-installed claude-code) and symlink
 * resolution that a hand-rolled walk would miss.
 */
export function verifyClaudeAvailability(): ClaudeAvailability {
  const bundled = findBundledClaudeCli();
  if (bundled) {
    if (process.platform !== 'win32') {
      try {
        fs.accessSync(bundled, fs.constants.X_OK);
      } catch {
        return {
          status: 'unreachable',
          reason: `Bundled Claude binary at ${bundled} is not executable`,
          searchedPaths: [bundled],
        };
      }
    }
    return { status: 'bundled', binaryPath: bundled };
  }

  const onPath = which.sync('claude', { nothrow: true });
  if (onPath) {
    return {
      status: 'path-fallback',
      binaryPath: onPath,
      reason: 'Bundled SDK binary not found; using claude on PATH',
    };
  }

  return {
    status: 'unreachable',
    reason: 'No Claude binary found — neither the bundled SDK binary nor a claude executable on PATH',
    searchedPaths: (process.env.PATH ?? '').split(path.delimiter).filter(Boolean),
  };
}
