/**
 * pi.dev authentication detection.
 *
 * KPM uses @earendil-works/pi-coding-agent as an in-process SDK, so
 * availability is auth-file based rather than PATH based (mirrors codex/auth.ts).
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const AUTH_FILE = join(homedir(), '.pi', 'agent', 'auth.json');

let cachedAvailability: boolean | null = null;

function hasConfiguredCredential(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  return Object.values(data as Record<string, unknown>).some(
    (credential) => credential !== null && typeof credential === 'object'
  );
}

/**
 * Check if the user has at least one configured pi provider/credential.
 * Result is cached; pass `forceRefresh` to re-read the auth file (e.g. after the
 * user runs `pi auth` mid-session).
 */
export async function isPiAvailable(forceRefresh = false): Promise<boolean> {
  if (!forceRefresh && cachedAvailability !== null) return cachedAvailability;
  try {
    const raw = await readFile(AUTH_FILE, 'utf-8');
    const data = JSON.parse(raw) as unknown;
    cachedAvailability = hasConfiguredCredential(data);
  } catch {
    cachedAvailability = false;
  }
  return cachedAvailability;
}
