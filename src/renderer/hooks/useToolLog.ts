import { useEffect } from 'react';
import { useToolLogStore } from '../stores/toolLogStore';

/**
 * Subscribe to tool call logging IPC events and forward to the store.
 * Mount this in a component that is active during chat (e.g., Chat component).
 */
export function useToolLog(projectId: string | null): void {
  useEffect(() => {
    if (!projectId) return;

    });
  }, [projectId]);
}
