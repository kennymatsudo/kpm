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

      item_id: id,
    }));
      item_id: id,
    }));

    const allIds = new Set([...selectedItemIds, ...descendantIds]);
      type: 'delete_item' as const,
      item_id: id,
    }));

  return {
    showBulkDeleteDialog,
    openBulkDeleteDialog: () => setShowBulkDeleteDialog(true),
    closeBulkDeleteDialog: () => setShowBulkDeleteDialog(false),
    handleBulkDeleteAll,
  };
}
