import { useCallback, useState } from 'react';
import type { FocusedResource, PlanItem } from '../../../../shared/types';

interface PlanContextMenuDeps {
  currentProjectId: string | null;
  selectedItemIds: Set<string>;
  planItemsById: Map<string, PlanItem>;
  addToQueue: (projectId: string, itemIds: string[]) => Promise<unknown>;
}

export function usePlanContextMenu({
  currentProjectId,
  selectedItemIds,
  planItemsById,
  addFocusedResource,
  addToQueue,
}: PlanContextMenuDeps) {

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (selectedItemIds.size > 0) {
        e.preventDefault();
      }
    },
    [selectedItemIds]
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

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

  const handleTreeContextMenu = useCallback(
      e.preventDefault();
    },
    []
  );

  return {
    contextMenu,
    handleContextMenu,
    closeContextMenu,
    handleAddToContext,
    handleAddItemToContext,
    handleTreeContextMenu,
  };
}
