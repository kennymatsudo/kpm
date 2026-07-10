/**
 * Claude Code sign-in detection.
 *
 * `verifyClaudeAvailability` (findClaude.ts) only checks that the binary exists.
 * Sign-in state is separate: Claude Code writes a plaintext sidecar at
 * ~/.claude.json whose `oauthAccount` object is populated once the user has
 * authenticated (the live token lives in the OS keychain, not here). Presence of
 * `oauthAccount.accountUuid` is a "has signed in" proxy — good enough to steer
 * onboarding, not a guarantee the current token is valid. No token value is read.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export function defaultClaudeJsonPath(): string {
  return join(homedir(), '.claude.json');
}

export interface ClaudeSignIn {
  signedIn: boolean;
  /** Account email when known — shown as "signed in as …", never a token. */
  email?: string;
}

export async function detectClaudeSignIn(
  configPath: string = defaultClaudeJsonPath(),
): Promise<ClaudeSignIn> {
  try {
    const raw = await readFile(configPath, 'utf-8');
    const data = JSON.parse(raw) as { oauthAccount?: { accountUuid?: unknown; emailAddress?: unknown } };
    const accountUuid = data.oauthAccount?.accountUuid;
    if (typeof accountUuid !== 'string' || accountUuid.length === 0) {
      return { signedIn: false };
    }
    const email = data.oauthAccount?.emailAddress;
    return { signedIn: true, email: typeof email === 'string' ? email : undefined };
  } catch {
    return { signedIn: false };
  }
}
