export interface TranscriptRow {
  id: string;
  role: 'user' | 'assistant';
  top: number;
  height: number;
}

/** The user turn behind whatever sits at the top of the viewport, once that
 * turn has scrolled fully out of view. While any of its note is still on
 * screen there is nothing to pin: the note already says what was asked.
 *
 * `rows` are in transcript order with tops relative to the same origin as
 * `viewTop`. */
export function findPinnedPromptId(rows: readonly TranscriptRow[], viewTop: number): string | null {
  let owner: TranscriptRow | null = null;
  for (const row of rows) {
    if (row.top > viewTop) break;
    if (row.role === 'user') owner = row;
  }
  if (!owner || owner.top + owner.height > viewTop) return null;
  return owner.id;
}
