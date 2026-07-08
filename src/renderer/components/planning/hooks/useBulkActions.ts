import { useCallback, useState } from 'react';
import type { PlanAction } from '../../../../shared/types';
import type { ApplyPlanActionsResult } from '../../../stores/project/types';
import { toast } from '../../../stores/toastStore';

interface BulkActionsDeps {
  selectedItemIds: Set<string>;
  descendantIds: Set<string>;
  executePlanActions: (actions: PlanAction[]) => Promise<ApplyPlanActionsResult>;
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

  // Run a set of delete actions with error handling. Returns a promise so the
  // confirm dialog drives its own loading/disabled state. On failure the dialog
  // stays open (selection preserved) and the error is surfaced via toast.
  const runBulkDelete = useCallback(
    async (actions: PlanAction[]) => {
      try {
        await executePlanActions(actions);
        clearSelection();
        setShowBulkDeleteDialog(false);
      } catch (error) {
        console.error('[useBulkActions] Bulk delete failed:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to delete items');
      }
    },
    [executePlanActions, clearSelection]
  );

  // Delete selected items and orphan their descendants (keep on canvas)
  const handleBulkDeleteOrphan = useCallback(() => {
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
    return runBulkDelete([...orphanActions, ...deleteActions]);
  }, [selectedItemIds, descendantIds, runBulkDelete]);

  // Delete selected items and all their descendants
  const handleBulkDeleteAll = useCallback(() => {
    const allIds = new Set([...selectedItemIds, ...descendantIds]);
    const deleteActions: PlanAction[] = Array.from(allIds).map(id => ({
      type: 'delete_item' as const,
      item_id: id,
    }));
    return runBulkDelete(deleteActions);
  }, [selectedItemIds, descendantIds, runBulkDelete]);

  return {
    showBulkDeleteDialog,
    openBulkDeleteDialog: () => setShowBulkDeleteDialog(true),
    closeBulkDeleteDialog: () => setShowBulkDeleteDialog(false),
    handleBulkDeleteOrphan,
    handleBulkDeleteAll,
  };
}
