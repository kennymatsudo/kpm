import { useEffect } from 'react';
import { subscribeToProjectFileChanges, type ProjectFileChangeEvent } from '../services/projectFileService';
import { emit } from '../stores/storeEvents';

/**
 * Bridge hook that centralizes file explorer IPC subscriptions.
 * Components can consume normalized events from storeEvents.
 */
export function useFileExplorerIpcBridge(projectId: string | null): void {
  useEffect(() => {
    if (!projectId) return;

    const unsubscribe = subscribeToProjectFileChanges((data: ProjectFileChangeEvent) => {
      if (data.projectId !== projectId) return;
      emit({
        type: 'file-explorer-changed',
        payload: data,
      });
    });

    return unsubscribe;
  }, [projectId]);
}
