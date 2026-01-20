/**
 * GroupContainer Component
 *
 * Figma-style frame/container for visually organizing plan items on the canvas.
 * Groups are purely visual - they don't affect the plan item hierarchy (parent_id).
 *
 * Features:
 * - Draggable by header to move the group
 * - Resizable by corner/edge handles
 * - Drop zone for assigning items to the group
 * - Colored header with group name
 */

import { useState, useRef, useCallback, memo, useEffect } from 'react';
import type { Group } from '../../../shared/types';
interface GroupContainerProps {
  group: Group;
  /** Current zoom level for proper sizing */
  zoom: number;
  /** Whether this group is selected */
  isSelected?: boolean;
  /** Callback when the group is clicked */
  onSelect?: (groupId: string) => void;
  /** Callback when group name is edited */
  onNameChange?: (groupId: string, name: string) => void;
  /** Callback when group is deleted */
  onDelete?: (groupId: string) => void;
  /** Children (PlanCards) to render inside */
  children?: React.ReactNode;
}

export const GroupContainer = memo(function GroupContainer({
  group,
  zoom,
  isSelected = false,
  onSelect,
  onNameChange,
  onDelete,
  children,
}: GroupContainerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(group.name);
  const containerRef = useRef<HTMLDivElement>(null);

  const cleanupRef = useRef<(() => void) | null>(null);

  // Cleanup event listeners on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    if (isEditingName) return;

    e.preventDefault();
    e.stopPropagation();

    // Cleanup any existing listeners first
    cleanupRef.current?.();

    setIsDragging(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartRef.current) return;



    };




      cleanup();
    };

    const cleanup = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      cleanupRef.current = null;
    };

    cleanupRef.current = cleanup;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

  // Handle name edit
  const handleNameSubmit = useCallback(() => {
    const trimmedName = editedName.trim();
    if (trimmedName && trimmedName !== group.name) {
      onNameChange?.(group.id, trimmedName);
    } else {
      setEditedName(group.name);
    }
    setIsEditingName(false);
  }, [editedName, group.id, group.name, onNameChange]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSubmit();
    } else if (e.key === 'Escape') {
      setEditedName(group.name);
      setIsEditingName(false);
    }
  }, [handleNameSubmit, group.name]);


  return (
    <div
      ref={containerRef}
      className={`
      `}
      style={{
        left: group.position_x,
        top: group.position_y,
        width: group.width,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(group.id);
      }}
    >
      {/* Header */}
      <div
        className={`
          ${isDragging ? 'cursor-grabbing' : ''}
        `}
        onMouseDown={handleMouseDown}
      >

        {/* Name (editable) */}
        {isEditingName ? (
          <input
            type="text"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={handleNameKeyDown}
            className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-text-primary"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
        )}

        {/* Delete button */}
        {onDelete && (
          <button
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md
              text-text-tertiary hover:text-danger hover:bg-danger-muted
              transition-all duration-150"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(group.id);
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>

    </div>
  );
});
