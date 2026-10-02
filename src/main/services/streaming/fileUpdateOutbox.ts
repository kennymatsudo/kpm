import type { FileUpdateEventData } from '../../../shared/ipc/chatEvents';

/**
 * Holds a session's file edits until they go quiet or the turn settles. The
 * agent edits a file in many small steps, and sending each step made the
 * review panel re-diff and re-render the whole file every time. Flushing sends
 * one update per file: the content from before the first held edit against
 * the last edit's content.
 *
 * Edits are not held for the whole turn: the agent can keep working for
 * minutes after its last edit, and the change should reach the queue while it
 * does. A later flush for the same file merges into the queued proposal, which
 * keeps the original before-content.
 *
 * Staged updates may still be reading the pre-edit content from disk, so they
 * are kept in call order and resolved together at flush time. Flushes for one
 * session run one at a time so a slow earlier batch cannot land after a newer
 * one and overwrite it in the queue.
 */
export function createFileUpdateOutbox(
  send: (update: FileUpdateEventData) => void,
  quietMs: number,
) {
  const staged = new Map<string, Promise<FileUpdateEventData | null>[]>();
  const quietTimers = new Map<string, NodeJS.Timeout>();
  const flushTails = new Map<string, Promise<void>>();

  function flush(sessionKey: string): Promise<void> {
    clearTimeout(quietTimers.get(sessionKey));
    quietTimers.delete(sessionKey);
    const queue = staged.get(sessionKey);
    if (!queue) return flushTails.get(sessionKey) ?? Promise.resolve();
    staged.delete(sessionKey);

    const tail = (flushTails.get(sessionKey) ?? Promise.resolve()).then(async () => {
      const byFile = new Map<string, FileUpdateEventData>();
      for (const update of await Promise.all(queue)) {
        if (!update) continue;
        const first = byFile.get(update.filePath);
        byFile.set(update.filePath, first ? { ...update, oldContent: first.oldContent } : update);
      }
      for (const update of byFile.values()) send(update);
    });
    flushTails.set(sessionKey, tail);
    void tail.finally(() => {
      if (flushTails.get(sessionKey) === tail) flushTails.delete(sessionKey);
    });
    return tail;
  }

  return {
    stage(sessionKey: string, update: FileUpdateEventData | Promise<FileUpdateEventData | null>): void {
      const queue = staged.get(sessionKey) ?? [];
      queue.push(Promise.resolve(update).catch((error) => {
        console.error('[FileUpdateOutbox] Dropped a staged file update:', error);
        return null;
      }));
      staged.set(sessionKey, queue);

      clearTimeout(quietTimers.get(sessionKey));
      quietTimers.set(sessionKey, setTimeout(() => void flush(sessionKey), quietMs));
    },

    flush,
  };
}

export type FileUpdateOutbox = ReturnType<typeof createFileUpdateOutbox>;
