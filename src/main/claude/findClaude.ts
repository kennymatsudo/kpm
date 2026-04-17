/**
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
 *
 *
 */
export function findBundledClaudeCli(): string | undefined {
  if (cachedBundledCliPath !== null) {
    return cachedBundledCliPath || undefined;
  }

    }
  }

  cachedBundledCliPath = '';
  return undefined;
}

/**
 *
 *
 */
export function getClaudeSdkSpawnOptions():
  | undefined {

}
