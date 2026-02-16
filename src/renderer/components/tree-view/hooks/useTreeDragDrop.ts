import { useState, useCallback, useMemo } from 'react';
import type { TreeNode } from '../../../utils/planHierarchy';

// Drop position indicator
export type DropPosition = 'before' | 'after' | 'inside' | null;

export interface DragState {
  draggedId: string;
  draggedNode: TreeNode;
  dropTargetId: string | null;
  dropPosition: DropPosition;
  /** True if the dragged item is under its actual Jira parent (can't move to root) */
  isUnderJiraParent: boolean;
}

interface TreeDragDropDeps {
  items: TreeNode[];
  onReparent?: (itemIds: string[], newParentId: string | null) => void;
}

export function useTreeDragDrop({ items, onReparent }: TreeDragDropDeps): {
  dragState: DragState | null;
  setDragState: React.Dispatch<React.SetStateAction<DragState | null>>;
  parentMap: Map<string, string | null>;
  itemMap: Map<string, TreeNode>;
  handleDragStart: (e: React.DragEvent, node: TreeNode) => void;
  handleDragEnd: () => void;
  handleDragOver: (e: React.DragEvent, nodeId: string, position: DropPosition) => void;
  handleDragLeave: () => void;
  handleDrop: (e: React.DragEvent, targetId: string, position: DropPosition) => void;
  handleContainerDrop: (e: React.DragEvent) => void;
  handleContainerDragOver: (e: React.DragEvent) => void;
} {
  const [dragState, setDragState] = useState<DragState | null>(null);

  // Build a map of item id -> parent id for reparenting logic
  const parentMap = useMemo(() => {
    const map = new Map<string, string | null>();
    const buildMap = (nodes: TreeNode[], parentId: string | null): void => {
      nodes.forEach((node) => {
        map.set(node.id, parentId);
        buildMap(node.children, node.id);
      });
    };
    buildMap(items, null);
    return map;
  }, [items]);

  // Build item map for sibling lookups
  const itemMap = useMemo(() => {
    const map = new Map<string, TreeNode>();
    const buildMap = (nodes: TreeNode[]): void => {
      nodes.forEach((node) => {
        map.set(node.id, node);
        buildMap(node.children);
      });
    };
    buildMap(items);
    return map;
  }, [items]);

  const handleDragStart = useCallback(
    (e: React.DragEvent, node: TreeNode) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', node.id);

      // Check if this item is under its actual Jira parent
      // (external_parent_key matches parent's external_key)
      let isUnderJiraParent = false;
      if (node.external_parent_key && node.parent_id) {
        const currentParent = itemMap.get(node.parent_id);
        isUnderJiraParent = currentParent?.external_key === node.external_parent_key;
      }

      // Create custom drag image
      const dragImage = document.createElement('div');
      dragImage.className =
        'px-3 py-1.5 bg-surface-2 rounded-lg shadow-lg text-sm text-text-primary border border-border-default';
      dragImage.textContent = node.title;
      dragImage.style.position = 'absolute';
      dragImage.style.top = '-1000px';
      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, 0, 0);
      requestAnimationFrame(() => document.body.removeChild(dragImage));

      setDragState({
        draggedId: node.id,
        draggedNode: node,
        dropTargetId: null,
        dropPosition: null,
        isUnderJiraParent,
      });
    },
    [itemMap],
  );

  const handleDragEnd = useCallback(() => {
    setDragState(null);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, nodeId: string, position: DropPosition) => {
      e.dataTransfer.dropEffect = 'move';
      setDragState((prev) =>
        prev
          ? {
              ...prev,
              dropTargetId: nodeId,
              dropPosition: position,
            }
          : null,
      );
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    // Don't clear immediately - let dragOver on next element set the new target
  }, []);

  const handleDrop = useCallback(
    (_e: React.DragEvent, targetId: string, position: DropPosition) => {
      if (!dragState || !onReparent) return;

      const { draggedId, isUnderJiraParent } = dragState;
      const targetNode = itemMap.get(targetId);
      if (!targetNode) return;

      // Determine new parent based on drop position
      let newParentId: string | null;

      if (position === 'inside') {
        // Dropping inside - target becomes parent
        newParentId = targetId;
      } else {
        // Dropping before/after - use target's parent (siblings)
        newParentId = parentMap.get(targetId) ?? null;
      }

      // Items under their Jira parent can't be moved to root
      if (isUnderJiraParent && newParentId === null) {
        setDragState(null);
        return;
      }

      // Don't reparent if already has this parent and dropping as sibling
      const currentParentId = parentMap.get(draggedId);
      if (position !== 'inside' && currentParentId === newParentId) {
        // Just reordering within same parent - for now, just reparent
        // TODO: Add proper reordering support
      }

      // Execute reparent
      onReparent([draggedId], newParentId);
      setDragState(null);
    },
    [dragState, onReparent, parentMap, itemMap],
  );

  // Handle drop on empty area (move to root)
  const handleContainerDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!dragState || !onReparent) return;

      // Items under their Jira parent can't be moved to root
      if (dragState.isUnderJiraParent) {
        setDragState(null);
        return;
      }

      // Dropping on container = move to root
      onReparent([dragState.draggedId], null);
      setDragState(null);
    },
    [dragState, onReparent],
  );

  const handleContainerDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  return {
    dragState,
    setDragState,
    parentMap,
    itemMap,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleContainerDrop,
    handleContainerDragOver,
  };
}
