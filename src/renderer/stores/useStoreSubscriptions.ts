/**
 * Store Subscriptions - Sets up cross-store event listeners.
 *
 * Call useStoreSubscriptions() once at app startup (e.g., in App.tsx)
 * to wire up event-driven communication between stores.
 */

import { useEffect } from 'react';
import { useExportStore } from './tracker/useExportStore';

/**
 * Initialize all cross-store subscriptions.
 * Should be called once in a top-level component.
 */
export function useStoreSubscriptions(): void {
  useEffect(() => {
    // Subscribe to status changes to auto-queue tracker-linked items for export
      const { projectId, itemId, statusCategory } = event.payload;
      const { addToQueueWithStatus } = useExportStore.getState();

      // Fire and forget - errors are handled in the store
      addToQueueWithStatus(projectId, [itemId], statusCategory).catch(() => {
        // Silent fail - export store handles its own errors
      });
    });

  }, []);
}
