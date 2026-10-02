import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Whether the user turned on Claude in Chrome by default in Claude Code
 * (`/chrome`). The CLI honors that only in interactive sessions, so an SDK
 * session gets the browser tools only if KPM passes `--chrome` itself. The
 * flag lives in the global config (`~/.claude.json`), not in settings.json,
 * so `resolveSettings` does not see it.
 */
export function userClaudeInChromeEnabled(): boolean {
  const configPath = path.join(process.env.CLAUDE_CONFIG_DIR || os.homedir(), '.claude.json');
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')).claudeInChromeDefaultEnabled === true;
  } catch {
    return false;
  }
}
