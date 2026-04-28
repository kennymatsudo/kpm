import { useCallback, useState } from 'react';
import type { FocusedResource, PlanItem } from '../../../../shared/types';

interface PlanContextMenuDeps {
  currentProjectId: string | null;
  selectedItemIds: Set<string>;
  planItemsById: Map<string, PlanItem>;
  addToQueue: (projectId: string, itemIds: string[]) => Promise<unknown>;
}

export interface ContextMenuState {
  x: number;
  y: number;
  /** When a single item is right-clicked, its ID. Null for multi-select. */
  singleItemId: string | null;
}

export function usePlanContextMenu({
  currentProjectId,
  selectedItemIds,
  planItemsById,
  addFocusedResource,
  addToQueue,
}: PlanContextMenuDeps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (selectedItemIds.size > 0) {
        e.preventDefault();
        const singleItemId = selectedItemIds.size === 1 ? Array.from(selectedItemIds)[0] : null;
        setContextMenu({ x: e.clientX, y: e.clientY, singleItemId });
      }
    },
    [selectedItemIds]
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Handle queue for tracker export
  const handleQueueForTracker = useCallback(async () => {
    if (!currentProjectId || selectedItemIds.size === 0) return;
    const itemIds = Array.from(selectedItemIds);
    await addToQueue(currentProjectId, itemIds);
    setContextMenu(null);
  }, [currentProjectId, selectedItemIds, addToQueue]);

    const resources: FocusedResource[] = Array.from(selectedItemIds).map((id) => {
      const item = planItemsById.get(id);
      return {
        type: 'plan_item' as const,
        id,
        title: item?.title ?? 'Unknown',
      };
    });
    setContextMenu(null);

  const handleAddItemToContext = useCallback(
      const item = planItemsById.get(itemId);
      const resource: FocusedResource = {
        type: 'plan_item',
        id: itemId,
        title: item?.title ?? 'Unknown',
      };
    },
    [planItemsById, addFocusedResource]
  );

  // Handle tree/board view context menu
  const handleTreeContextMenu = useCallback(
    (e: React.MouseEvent, ids: Set<string>) => {
      e.preventDefault();
      const singleItemId = ids.size === 1 ? Array.from(ids)[0] : null;
      setContextMenu({ x: e.clientX, y: e.clientY, singleItemId });
    },
    []
  );

  return {
    contextMenu,
    handleContextMenu,
    closeContextMenu,
    handleQueueForTracker,
    handleAddToContext,
    handleAddItemToContext,
    handleTreeContextMenu,
  };
}
