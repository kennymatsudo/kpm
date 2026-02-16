import { useState, useCallback, useMemo } from 'react';
import type { TreeNode } from '../../../utils/planHierarchy';

interface DragPreviewState {
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  nodes: { node: TreeNode; relativeX: number; relativeY: number }[];
  depth: number;
}

interface CanvasDragPreviewDeps {
  itemsWithPositions: TreeNode[];
}

interface UseCanvasDragPreviewReturn {
  dragPreview: DragPreviewState | null;
  handleDragStart: (item: TreeNode, x: number, y: number, offsetX: number, offsetY: number, depth: number, selectedIds: string[]) => void;
  handleDragEnd: () => void;
  handleDragEnter: () => void;
  handleContainerDragEnd: () => void;
}

export function useCanvasDragPreview({
  itemsWithPositions,
}: CanvasDragPreviewDeps): UseCanvasDragPreviewReturn {
  const [dragPreview, setDragPreview] = useState<DragPreviewState | null>(null);

  // Build a map from item ID to TreeNode for quick lookup during drag preview
  const itemsById = useMemo(() => {
    const map = new Map<string, TreeNode>();
    itemsWithPositions.forEach(node => map.set(node.id, node));
    return map;
  }, [itemsWithPositions]);

  const handleDragStart = useCallback((item: TreeNode, x: number, y: number, offsetX: number, offsetY: number, depth: number, selectedIds: string[]) => {
    // Use pre-built map for O(1) lookups instead of filtering the array
    const nodesToPreview = selectedIds.map(id => itemsById.get(id)).filter((n): n is TreeNode => n !== undefined);

    const anchorX = item.position_x ?? 0;
    const anchorY = item.position_y ?? 0;
    const nodesWithRelativePos = (nodesToPreview.length > 0 ? nodesToPreview : [item]).map(n => ({
      node: n,
      relativeX: (n.position_x ?? 0) - anchorX,
      relativeY: (n.position_y ?? 0) - anchorY,
    }));

    setDragPreview({ x, y, offsetX, offsetY, nodes: nodesWithRelativePos, depth });
  }, [itemsById]);

  const handleDragEnd = useCallback(() => {
    setDragPreview(null);
  }, []);


  const handleContainerDragEnd = useCallback(() => {
    setDragPreview(null);
  }, []);

  return {
    dragPreview,
    setDragPreview,
    handleDragStart,
    handleDragEnd,
    handleDragEnter,
    handleContainerDragEnd,
  };
}
