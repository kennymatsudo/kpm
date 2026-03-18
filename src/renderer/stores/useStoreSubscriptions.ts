/**
 * Store Subscriptions - Sets up cross-store event listeners.
 *
 * Call useStoreSubscriptions() once at app startup (e.g., in App.tsx)
 * to wire up event-driven communication between stores.
 */

import { useEffect } from 'react';
import { subscribe } from './storeEvents';
import { useExportStore } from './tracker/useExportStore';
import { useTrackerStore } from './trackerStore';

/**
 * Initialize all cross-store subscriptions.
 * Should be called once in a top-level component.
 */
export function useStoreSubscriptions(): void {
  useEffect(() => {
    // Subscribe to status changes to auto-queue tracker-linked items for export
    const unsubscribeStatusChanged = subscribe('status-changed', (event) => {
      const { projectId, itemId, statusCategory } = event.payload;

      const { addToQueueWithStatus } = useExportStore.getState();

      // Fire and forget - errors are handled in the store
      addToQueueWithStatus(projectId, [itemId], statusCategory).catch(() => {
        // Silent fail - export store handles its own errors
      });
    });

    // Subscribe to plan item creation for auto-queue
    // Only queue local items with a non-backlog status when exactly one association exists
    const unsubscribePlanItemCreated = subscribe('plan-item-created', (event) => {
      const { projectId, itemId, statusCategory, syncSource } = event.payload;

      // Skip items from trackers (imports) or without a status
      if (syncSource !== 'local' || !statusCategory || statusCategory === 'not_started') {
        return;
      }

      const { associations } = useTrackerStore.getState();
      const { addToQueueWithStatus } = useExportStore.getState();

      // Only auto-queue if exactly one association exists (unambiguous destination)
      if (associations.length === 1) {
        addToQueueWithStatus(projectId, [itemId], statusCategory).catch(() => {
          // Silent fail - export store handles its own errors
        });
      }
    });

    return () => {
      unsubscribeStatusChanged();
      unsubscribePlanItemCreated();
    };
  }, []);
}
