/**
 * Project-scoped localStorage persistence for "which documents were open".
 *
 * Only the arrangement is stored — source, path, and which tab was active.
 * Content is re-read from disk on restore, so a file edited or deleted outside
 * KPM between launches comes back as it actually is, or not at all.
 */

const KEY_PREFIX = 'kpm:workspace:open-documents:';

export interface PersistedDocumentRef {
  source: string;
  path: string;
}

export interface PersistedDocumentState {
  /** Open documents, in tab order. */
  open: PersistedDocumentRef[];
  /** Document id (`source:path`) of the tab that was active at last write. */
  active: string | null;
}

function storageKey(projectId: string): string {
  return `${KEY_PREFIX}${projectId}`;
}

export function readPersistedDocuments(projectId: string): PersistedDocumentState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedDocumentState;
    if (!Array.isArray(parsed.open)) return null;
    return {
      open: parsed.open.filter(
        (entry): entry is PersistedDocumentRef =>
          typeof entry?.source === 'string' && typeof entry?.path === 'string'
      ),
      active: typeof parsed.active === 'string' ? parsed.active : null,
    };
  } catch {
    return null;
  }
}

export function writePersistedDocuments(projectId: string, state: PersistedDocumentState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(state));
  } catch {
    // Quota exceeded or storage unavailable — tab restoration is non-critical.
  }
}
