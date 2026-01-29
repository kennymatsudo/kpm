/**
 * CanvasContextMenu Component
 *
 * Context menu for right-clicking on the empty canvas area.
 * Allows creating groups at the click position.
 */

import { DropdownMenu } from '../ui';

interface CanvasContextMenuProps {
  x: number;
  y: number;
  onCreateItem: () => void;
  onCreateGroup: () => void;
  onClose: () => void;
}

export function CanvasContextMenu({ x, y, onCreateItem, onCreateGroup, onClose }: CanvasContextMenuProps) {
  return (
    <DropdownMenu
      isOpen={true}
      onClose={onClose}
      position={{ type: 'point', x, y }}
    >
      <DropdownMenu.Item
        onClick={onCreateItem}
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        }
      >
        Create Item
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onClick={onCreateGroup}
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        }
      >
        Create Group
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
