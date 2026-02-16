import { useState, useCallback } from 'react';

export interface LocalContextMenuState {
  x: number;
  y: number;
  itemId: string;
}

interface TreeContextMenuDeps {
  selectedIds: Set<string>;
  onSelectItem: (id: string, addToSelection: boolean) => void;
  onEditItem: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, selectedIds: Set<string>) => void;
  onCreateItem?: (parentId: string | null) => void;
}

export function useTreeContextMenu({
  selectedIds,
  onSelectItem,
  onEditItem,
  onContextMenu,
  onCreateItem,
}: TreeContextMenuDeps): {
  localContextMenu: LocalContextMenuState | null;
  setLocalContextMenu: React.Dispatch<React.SetStateAction<LocalContextMenuState | null>>;
  handleContextMenu: (e: React.MouseEvent, id: string) => void;
  handleAddChild: () => void;
  handleEditFromContextMenu: () => void;
  handleMoreOptions: (e: React.MouseEvent) => void;
} {
  const [localContextMenu, setLocalContextMenu] = useState<LocalContextMenuState | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      // If item not selected, select it first
      if (!selectedIds.has(id)) {
        onSelectItem(id, false);
      }

      // If onCreateItem is provided, show local context menu with "Add Child" option
      if (onCreateItem) {
        setLocalContextMenu({ x: e.clientX, y: e.clientY, itemId: id });
      } else {
        // Trigger parent context menu handler
        const newSelection = selectedIds.has(id) ? selectedIds : new Set([id]);
        onContextMenu?.(e, newSelection);
      }
    },
    [selectedIds, onSelectItem, onContextMenu, onCreateItem],
  );

  const handleAddChild = useCallback(() => {
    if (localContextMenu && onCreateItem) {
      onCreateItem(localContextMenu.itemId);
    }
    setLocalContextMenu(null);
  }, [localContextMenu, onCreateItem]);

  const handleEditFromContextMenu = useCallback(() => {
    if (localContextMenu) {
      onEditItem(localContextMenu.itemId);
    }
    setLocalContextMenu(null);
  }, [localContextMenu, onEditItem]);

  const handleMoreOptions = useCallback(
    (e: React.MouseEvent) => {
      if (localContextMenu && onContextMenu) {
        const newSelection = selectedIds.has(localContextMenu.itemId)
          ? selectedIds
          : new Set([localContextMenu.itemId]);
        onContextMenu(e, newSelection);
      }
      setLocalContextMenu(null);
    },
    [localContextMenu, selectedIds, onContextMenu],
  );

  return {
    localContextMenu,
    setLocalContextMenu,
    handleContextMenu,
    handleAddChild,
    handleEditFromContextMenu,
    handleMoreOptions,
  };
}
