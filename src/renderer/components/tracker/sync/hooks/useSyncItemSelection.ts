import { useEffect, useMemo, useState } from 'react';
import type { SyncReviewItem } from '../../../../../shared/types';

interface SyncItemSelectionDeps {
  items: SyncReviewItem[];
}

interface SyncItemSelectionResult {
  selectedItemId: string | null;
  setSelectedItemId: (id: string | null) => void;
  selectedItem: SyncReviewItem | null;
}

export function useSyncItemSelection({ items }: SyncItemSelectionDeps): SyncItemSelectionResult {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Auto-select first item when items load
  useEffect(() => {
    if (items.length > 0 && !selectedItemId) {
      setSelectedItemId(items[0].planItem.id);
    }
  }, [items, selectedItemId]);

  const selectedItem = useMemo(
    () => items.find(i => i.planItem.id === selectedItemId) ?? null,
    [items, selectedItemId]
  );

  return {
    selectedItemId,
    setSelectedItemId,
    selectedItem,
  };
}
