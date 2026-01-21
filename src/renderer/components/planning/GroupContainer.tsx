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
import { GROUP_LAYOUT } from '../../constants/layout';

interface GroupContainerProps {
  group: Group;
  /** Current zoom level for proper sizing */
  zoom: number;
  /** Whether this group is selected */
  isSelected?: boolean;
  /** Whether the group is currently colliding with another element */
  hasCollision?: boolean;
  /** Whether an item is being dragged over this group */
  isDragOver?: boolean;
  /** Callback when the group is clicked */
  onSelect?: (groupId: string) => void;
  /** Callback when drag completes - provides final delta to apply */
  onDragComplete?: (groupId: string, deltaX: number, deltaY: number) => void;
  /** Callback when group name is edited */
  onNameChange?: (groupId: string, name: string) => void;
  /** Callback when collapsed state changes */
  onCollapseChange?: (groupId: string, isCollapsed: boolean) => void;
  /** Callback when group is deleted */
  onDelete?: (groupId: string) => void;
  /** Callback when drag starts */
  onDragStart?: (groupId: string) => void;
  /** Callback when drag ends */
  onDragEnd?: (groupId: string) => void;
  /** Check collision at current position - returns true if colliding */
  checkCollision?: (groupId: string, deltaX: number, deltaY: number) => boolean;
  /** Children (PlanCards) to render inside */
  children?: React.ReactNode;
}

export const GroupContainer = memo(function GroupContainer({
  group,
  zoom,
  isSelected = false,
  hasCollision = false,
  isDragOver = false,
  onSelect,
  onDragComplete,
  onNameChange,
  onCollapseChange,
  onDelete,
  onDragStart,
  onDragEnd,
  checkCollision,
  children,
}: GroupContainerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(group.name);
  // Transform offset for visual dragging (no state updates during drag)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  // Track collision state locally during drag
  const [localHasCollision, setLocalHasCollision] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  // Track cleanup functions for drag listeners
  const cleanupRef = useRef<(() => void) | null>(null);

  // Use refs for callbacks and state to avoid stale closures during drag
  const onDragCompleteRef = useRef(onDragComplete);
  const onDragEndRef = useRef(onDragEnd);
  const checkCollisionRef = useRef(checkCollision);
  const dragOffsetRef = useRef(dragOffset);
  onDragCompleteRef.current = onDragComplete;
  onDragEndRef.current = onDragEnd;
  checkCollisionRef.current = checkCollision;
  dragOffsetRef.current = dragOffset;

  // Cleanup event listeners on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  // Handle header drag for moving - uses CSS transform during drag for performance
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    if (isEditingName) return;

    e.preventDefault();
    e.stopPropagation();

    // Cleanup any existing listeners first
    cleanupRef.current?.();

    setIsDragging(true);
    setLocalHasCollision(false);
    onDragStart?.(group.id);
    dragStartRef.current = { x: e.clientX, y: e.clientY };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartRef.current) return;

      // Calculate total delta from drag start (in canvas coordinates)
      const deltaX = (moveEvent.clientX - dragStartRef.current.x) / zoom;
      const deltaY = (moveEvent.clientY - dragStartRef.current.y) / zoom;

      // Update visual position via CSS transform (no state updates to parent)
      setDragOffset({ x: deltaX, y: deltaY });

      // Check collision at this position
      if (checkCollisionRef.current) {
        const collides = checkCollisionRef.current(group.id, deltaX, deltaY);
        setLocalHasCollision(collides);
      }
    };

    const handleMouseUp = () => {
      // Get final offset from ref (already in canvas coordinates)
      const finalDelta = { ...dragOffsetRef.current };

      // Reset visual transform
      setDragOffset({ x: 0, y: 0 });
      setIsDragging(false);
      setLocalHasCollision(false);

      // Notify parent of final position change (batch update happens here)
      if (onDragCompleteRef.current && (finalDelta.x !== 0 || finalDelta.y !== 0)) {
        onDragCompleteRef.current(group.id, finalDelta.x, finalDelta.y);
      }

      onDragEndRef.current?.(group.id);
      dragStartRef.current = null;
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
  }, [group.id, zoom, isEditingName, onDragStart]);

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

  // Handle collapse toggle
  const handleCollapseToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onCollapseChange?.(group.id, !group.is_collapsed);
  }, [group.id, group.is_collapsed, onCollapseChange]);

  const isCollapsed = group.is_collapsed;

  // Show collision feedback during drag (use local state for immediate feedback)
  const showCollisionWarning = isDragging && (localHasCollision || hasCollision);

  return (
    <div
      ref={containerRef}
      className={`
        ${showCollisionWarning
          ? 'border-danger'
          : isDragOver
            ? 'border-accent border-dashed'
            : 'border-border-default'
        }
        ${isSelected && !showCollisionWarning && !isDragOver ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface-0' : ''}
        ${isDragging ? 'cursor-grabbing' : ''}
      `}
      data-group-container
      style={{
        left: group.position_x,
        top: group.position_y,
        width: group.width,
        // Use CSS transform for visual positioning during drag (no state updates)
        transform: isDragging ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : undefined,
        // Use inline style for solid background when dragging to ensure no transparency
        ...(isDragging && {
          backgroundColor: showCollisionWarning
            ? 'rgb(254, 202, 202)' // Light red for collision
            : 'rgb(255, 255, 255)', // Solid white
          // Force opacity to 1 and create isolation context to ensure solid background
          opacity: 1,
          isolation: 'isolate',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }),
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(group.id);
      }}
    >
      {/* Header */}
      <div
        className={`
          flex items-center gap-2 px-3 py-2 cursor-grab bg-surface-1
          ${isCollapsed ? 'rounded-[10px]' : 'rounded-t-[10px]'}
          ${isDragging ? 'cursor-grabbing' : ''}
        `}
        onMouseDown={handleMouseDown}
      >
        {/* Collapse toggle button */}
        <button
          className="p-0.5 rounded text-text-tertiary hover:text-text-primary hover:bg-surface-2
            transition-colors flex-shrink-0"
          onClick={handleCollapseToggle}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-150 ${isCollapsed ? '' : 'rotate-90'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

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
          <>
            <span className="flex-1 text-sm font-medium text-text-primary truncate">
              {group.name}
            </span>
            {/* Edit name button */}
            <button
              className="opacity-0 group-hover:opacity-100 p-1 rounded
                text-text-tertiary hover:text-text-primary hover:bg-surface-2
                transition-all duration-150 flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingName(true);
                setEditedName(group.name);
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </>
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

      {/* Content area - hidden when collapsed */}
      {!isCollapsed && (
          {children}
        </div>
      )}
    </div>
  );
});
