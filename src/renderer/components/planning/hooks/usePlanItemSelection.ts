import { useCallback, useEffect, useRef } from 'react';
import { useLatestRef } from '../../../hooks/useLatestRef';
import { getContiguousRange, type RangeSelectHandler } from '../../../utils/rangeSelection';

interface UsePlanItemSelectionDeps {
  selectedItemIds: Set<string>;
  setSelectedItemIds: (ids: Set<string>) => void;
}

type SelectItemHandler = (itemId: string | null, addToSelection?: boolean) => void;

function isEditableElement(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;

  const tag = element.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || element.isContentEditable;
}

export function usePlanItemSelection({
  selectedItemIds,
  setSelectedItemIds,
}: UsePlanItemSelectionDeps): {
  handleSelectItem: SelectItemHandler;
  handleSelectRange: RangeSelectHandler;
} {
  const selectedItemIdsRef = useLatestRef(selectedItemIds);

  // Shift-click keeps extending from the first plain/cmd-clicked item.
  const selectionAnchorRef = useRef<string | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedItemIds(new Set());
    selectionAnchorRef.current = null;
  }, [setSelectedItemIds]);

  const handleSelectItem = useCallback<SelectItemHandler>(
    (itemId, addToSelection = false) => {
      if (itemId === null) {
        clearSelection();
        return;
      }

      const current = selectedItemIdsRef.current;

      if (addToSelection) {
        const next = new Set(current);
        if (next.has(itemId)) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
        setSelectedItemIds(next);
        selectionAnchorRef.current = itemId;
        return;
      }

      selectionAnchorRef.current = itemId;

      if (current.size === 1 && current.has(itemId)) {
        return;
      }

      setSelectedItemIds(new Set([itemId]));
    },
    [clearSelection, selectedItemIdsRef, setSelectedItemIds],
  );

  const handleSelectRange = useCallback<RangeSelectHandler>(
    (targetId, orderedIds) => {
      const range = getContiguousRange(orderedIds, selectionAnchorRef.current, targetId);

      if (range === null) {
        setSelectedItemIds(new Set([targetId]));
        selectionAnchorRef.current = targetId;
        return;
      }

      const next = new Set(selectedItemIdsRef.current);
      for (const id of range) {
        next.add(id);
      }
      setSelectedItemIds(next);
    },
    [selectedItemIdsRef, setSelectedItemIds],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isEditableElement(document.activeElement)) return;
      if (selectedItemIdsRef.current.size === 0) return;

      clearSelection();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection, selectedItemIdsRef]);

  return {
    handleSelectItem,
    handleSelectRange,
  };
}
