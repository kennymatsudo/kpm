import { useCallback, useState } from 'react';
import type { PlanAction } from '../../../../shared/types';

interface BulkActionsDeps {
  selectedItemIds: Set<string>;
  descendantIds: Set<string>;
  executePlanActions: (actions: PlanAction[]) => Promise<void>;
  setSelectedItemIds: (ids: Set<string>) => void;
}

export function useBulkActions({
  selectedItemIds,
  descendantIds,
  executePlanActions,
  setSelectedItemIds,
}: BulkActionsDeps) {
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const clearSelection = useCallback(() => setSelectedItemIds(new Set()), [setSelectedItemIds]);

  // Delete selected items and orphan their descendants (keep on canvas)
    // First orphan descendants by reparenting to root
    const orphanActions: PlanAction[] = Array.from(descendantIds).map(id => ({
      type: 'reparent' as const,
      item_id: id,
      new_parent_id: null,
    }));
    // Then delete selected items
    const deleteActions: PlanAction[] = Array.from(selectedItemIds).map(id => ({
      type: 'delete_item' as const,
      item_id: id,
    }));

  // Delete selected items and all their descendants
    const allIds = new Set([...selectedItemIds, ...descendantIds]);
    const deleteActions: PlanAction[] = Array.from(allIds).map(id => ({
      type: 'delete_item' as const,
      item_id: id,
    }));

  return {
    showBulkDeleteDialog,
    openBulkDeleteDialog: () => setShowBulkDeleteDialog(true),
    closeBulkDeleteDialog: () => setShowBulkDeleteDialog(false),
    handleBulkDeleteOrphan,
    handleBulkDeleteAll,
  };
}
