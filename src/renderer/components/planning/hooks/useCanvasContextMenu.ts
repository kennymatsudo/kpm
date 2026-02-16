import { useState, useCallback } from 'react';

interface ContextMenuState {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
}

interface CanvasContextMenuDeps {
  projectId: string;
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  onSelectItem: (itemId: string | null, addToSelection?: boolean) => void;
  onCreateItem?: (canvasPosition: { x: number; y: number }) => void;
  createGroup: (projectId: string, name: string, options: { position_x: number; position_y: number }) => Promise<unknown>;
  deleteGroup: (groupId: string) => Promise<unknown> | void;
}

interface UseCanvasContextMenuReturn {
  canvasContextMenu: ContextMenuState | null;
  selectedGroupId: string | null;
  setSelectedGroupId: React.Dispatch<React.SetStateAction<string | null>>;
  handleCanvasContextMenu: (e: React.MouseEvent) => void;
  handleCreateItem: () => void;
  handleCreateGroup: () => Promise<void>;
  closeContextMenu: () => void;
  handleGroupSelect: (groupId: string) => void;
  handleGroupDelete: (groupId: string) => void;
}

export function useCanvasContextMenu({
  projectId,
  screenToCanvas,
  onSelectItem,
  onCreateItem,
  createGroup,
  deleteGroup,
}: CanvasContextMenuDeps): UseCanvasContextMenuReturn {
  const [canvasContextMenu, setCanvasContextMenu] = useState<ContextMenuState | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Only show canvas context menu if clicking on empty canvas (not on cards or groups)
    if (!target.closest('[data-plan-card]') && !target.closest('[data-group-container]')) {
      e.preventDefault();
      const { x: canvasX, y: canvasY } = screenToCanvas(e.clientX, e.clientY);
      setCanvasContextMenu({ x: e.clientX, y: e.clientY, canvasX, canvasY });
    }
  }, [screenToCanvas]);

  const handleCreateItem = useCallback(() => {
    if (!canvasContextMenu || !onCreateItem) return;
    onCreateItem({
      x: canvasContextMenu.canvasX,
      y: canvasContextMenu.canvasY,
    });
    setCanvasContextMenu(null);
  }, [canvasContextMenu, onCreateItem]);

  const handleCreateGroup = useCallback(async () => {
    if (!canvasContextMenu) return;
    await createGroup(projectId, 'New Group', {
      position_x: canvasContextMenu.canvasX,
      position_y: canvasContextMenu.canvasY,
    });
    setCanvasContextMenu(null);
  }, [canvasContextMenu, createGroup, projectId]);

  const closeContextMenu = useCallback(() => {
    setCanvasContextMenu(null);
  }, []);

  const handleGroupSelect = useCallback((groupId: string) => {
    setSelectedGroupId(groupId);
    onSelectItem(null); // Deselect any selected plan items
  }, [onSelectItem]);

  const handleGroupDelete = useCallback((groupId: string) => {
    void deleteGroup(groupId);
    if (selectedGroupId === groupId) {
      setSelectedGroupId(null);
    }
  }, [deleteGroup, selectedGroupId]);

  return {
    canvasContextMenu,
    selectedGroupId,
    setSelectedGroupId,
    handleCanvasContextMenu,
    handleCreateItem,
    handleCreateGroup,
    closeContextMenu,
    handleGroupSelect,
    handleGroupDelete,
  };
}
