/**
 * Project-scoped localStorage persistence for "which chat tabs were open".
 *
 * This is pure UI state — the list of session IDs the user had open, plus
 * which one was focused. The chat content itself lives in SQLite; we only
 * persist the tab arrangement here so it can be restored on next launch.
 */

const KEY_PREFIX = 'kpm:chat:open-sessions:';

export interface PersistedTabState {
  /** Open session IDs, ordered most-recent-first. */
  open: string[];
  /** Which tab was focused at last write. */
  viewed: string | null;
}

function storageKey(projectId: string): string {
  return `${KEY_PREFIX}${projectId}`;
}

export function readPersistedTabs(projectId: string): PersistedTabState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedTabState;
    if (!Array.isArray(parsed.open)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePersistedTabs(projectId: string, state: PersistedTabState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(state));
  } catch {
    // Quota exceeded or storage unavailable — tab restoration is non-critical.
  }
}
