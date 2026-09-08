import { useEffect } from 'react';
import { isDocumentDirty, useWorkspaceStore } from '../../stores/workspaceStore';
import { createAutosaveScheduler } from './documentAutosave';

const AUTOSAVE_DEBOUNCE_MS = 1000;

/**
 * Runs autosave for every open document. Mount this above the editor — the
 * point is that it keeps running for tabs that are not on screen.
 */
export function useDocumentAutosave(): void {
  useEffect(() => {
    const scheduler = createAutosaveScheduler({
      save: (id) => void useWorkspaceStore.getState().saveDocument(id),
      delayMs: AUTOSAVE_DEBOUNCE_MS,
    });

    const sync = () => {
      scheduler.sync(
        useWorkspaceStore.getState().openDocuments.map((document) => ({
          id: document.id,
          content: document.content,
          dirty: isDocumentDirty(document),
        }))
      );
    };

    sync();
    const unsubscribe = useWorkspaceStore.subscribe(sync);
    return () => {
      unsubscribe();
      // Leaving the workspace view should not cost the last second of typing.
      // Best effort: a project switch clears the documents first, and then
      // there is nothing left to write.
      scheduler.flush();
    };
  }, []);
}
