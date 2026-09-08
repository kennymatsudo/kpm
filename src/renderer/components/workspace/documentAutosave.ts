/**
 * Debounced autosave across every open document, not just the visible one.
 *
 * The debounce used to live inside the editor component, which only mounts for
 * the active tab. With one document open that was harmless; with a strip it
 * means switching tabs mid-debounce unmounts the pending timer and strands the
 * edit in the store, unwritten. So the timers live above the editor, one per
 * document, and a background tab's edits reach disk on their own schedule.
 *
 * A save is scheduled by a change in content, never by a document merely being
 * dirty — otherwise a failed write, which leaves the document dirty with no
 * timer, would immediately reschedule itself and retry forever.
 */

export interface AutosaveTarget {
  id: string;
  content: string;
  dirty: boolean;
}

export interface AutosaveScheduler {
  /** Reconcile the timers with the current documents. Safe to call on every store change. */
  sync: (targets: readonly AutosaveTarget[]) => void;
  /** Write everything still pending, now. */
  flush: () => void;
  cancel: () => void;
}

export interface AutosaveSchedulerOptions {
  save: (id: string) => void;
  delayMs: number;
}

export function createAutosaveScheduler(options: AutosaveSchedulerOptions): AutosaveScheduler {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const lastContent = new Map<string, string>();

  const clear = (id: string) => {
    const timer = timers.get(id);
    if (timer === undefined) return;
    clearTimeout(timer);
    timers.delete(id);
  };

  return {
    sync: (targets) => {
      const present = new Set<string>();

      for (const target of targets) {
        present.add(target.id);
        const previous = lastContent.get(target.id);
        lastContent.set(target.id, target.content);

        if (!target.dirty) {
          clear(target.id);
          continue;
        }
        // Keystrokes restart the countdown; anything else — another tab saving,
        // a selection change — must leave this document's timer alone.
        if (previous === target.content) continue;

        clear(target.id);
        timers.set(
          target.id,
          setTimeout(() => {
            timers.delete(target.id);
            options.save(target.id);
          }, options.delayMs)
        );
      }

      for (const id of [...timers.keys()]) {
        if (!present.has(id)) clear(id);
      }
      for (const id of [...lastContent.keys()]) {
        if (!present.has(id)) lastContent.delete(id);
      }
    },

    flush: () => {
      for (const id of [...timers.keys()]) {
        clear(id);
        options.save(id);
      }
    },

    cancel: () => {
      for (const id of [...timers.keys()]) clear(id);
      lastContent.clear();
    },
  };
}
