/**
 * Claude Code Hook Config Generator
 *
 * Generates a temporary settings file with PreToolUse/PostToolUse/Stop hooks
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Generate a Claude Code settings file with hooks configured to call the hook server.
 * Returns the path to the generated settings file.
 */
export function generateClaudeCodeHookSettings(
  sessionId: string,
  hookPort: number,
): string {
  const hookUrl = `http://127.0.0.1:${hookPort}/hook/${sessionId}`;

  // Claude Code hooks use shell commands. We use curl to POST to the hook server.
  // The hook receives tool info via environment variables set by Claude Code.
  const settings = {
    hooks: {
      PreToolUse: [
        {
          matcher: '*',
          hooks: [
            {
              type: 'command',
              command: `curl -s -X POST ${hookUrl} -H 'Content-Type: application/json' -d "{\\"event\\":\\"pre_tool_use\\",\\"toolName\\":\\"$CLAUDE_TOOL_NAME\\",\\"summary\\":\\"$CLAUDE_TOOL_NAME\\"}" > /dev/null 2>&1 || true`,
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: '*',
          hooks: [
            {
              type: 'command',
              command: `curl -s -X POST ${hookUrl} -H 'Content-Type: application/json' -d "{\\"event\\":\\"post_tool_use\\",\\"toolName\\":\\"$CLAUDE_TOOL_NAME\\"}" > /dev/null 2>&1 || true`,
            },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            {
              type: 'command',
              command: `curl -s -X POST ${hookUrl} -H 'Content-Type: application/json' -d "{\\"event\\":\\"stop\\"}" > /dev/null 2>&1 || true`,
            },
          ],
        },
      ],
    },
  };

  // Write to a temp file
  fs.mkdirSync(settingsDir, { recursive: true });
  const settingsPath = path.join(settingsDir, `claude-hooks-${sessionId}.json`);
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

  return settingsPath;
}

/**
 * Clean up the temporary settings file for a session.
 */
export function cleanupClaudeCodeHookSettings(sessionId: string): void {
  try {
    fs.unlinkSync(settingsPath);
  } catch {
    // File may not exist
  }
}
