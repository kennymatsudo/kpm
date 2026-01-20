/**
 * CanvasContextMenu Component
 *
 * Context menu for right-clicking on the empty canvas area.
 * Allows creating groups at the click position.
 */


interface CanvasContextMenuProps {
  x: number;
  y: number;
  onCreateItem: () => void;
  onCreateGroup: () => void;
  onClose: () => void;
}

export function CanvasContextMenu({ x, y, onCreateItem, onCreateGroup, onClose }: CanvasContextMenuProps) {
    >
      >
        Create Item
      >
        Create Group
  );
}
