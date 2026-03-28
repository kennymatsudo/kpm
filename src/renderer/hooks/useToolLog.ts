import { useEffect } from 'react';
import { useToolLogStore } from '../stores/toolLogStore';
import { subscribeToToolLogEvents } from '../services/toolLogService';

/**
 * Subscribe to tool call logging IPC events and forward to the store.
 * Mount this in a component that is active during chat (e.g., Chat component).
 */
export function useToolLog(projectId: string | null): void {
  useEffect(() => {
    if (!projectId) return;

    return subscribeToToolLogEvents({
      onCall: (entry) => {
        if (entry.projectId !== projectId) return;
        useToolLogStore.getState().addEntry(entry);
      },
      onTurnSummary: (summary) => {
        useToolLogStore.getState().addTurnSummary(summary);
      },
    });
  }, [projectId]);
}
