import { useEffect } from 'react';
import { emit } from '../stores/storeEvents';

/**
 * Bridge hook that centralizes file explorer IPC subscriptions.
 * Components can consume normalized events from storeEvents.
 */
export function useFileExplorerIpcBridge(projectId: string | null): void {
  useEffect(() => {
    if (!projectId) return;

      if (data.projectId !== projectId) return;
      emit({
        type: 'file-explorer-changed',
        payload: data,
      });
    });

    return unsubscribe;
  }, [projectId]);
}
