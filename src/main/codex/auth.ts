/**
 * Codex authentication detection.
 *
 * KPM uses @openai/codex-sdk directly. The SDK reads credentials from
 * ~/.codex/auth.json, so availability is auth-file based rather than PATH based.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { CodexStatus } from '../../shared/types';

const AUTH_FILE = join(homedir(), '.codex', 'auth.json');

/** Check if the user has valid Codex credentials. */
export async function hasCodexAuth(): Promise<boolean> {
  try {
    const raw = await readFile(AUTH_FILE, 'utf-8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    // auth.json should have an API key or OAuth tokens
    return !!(data.OPENAI_API_KEY || data.tokens);
  } catch {
    return false;
  }
}

/** Get Codex availability status. */
export async function getCodexStatus(): Promise<CodexStatus> {
  // The SDK is bundled as a dependency, so "installed" is always true.
  // The only question is whether the user has authenticated.
  const authenticated = await hasCodexAuth();
  return { installed: true, authenticated };
}
