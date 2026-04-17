import { useMemo } from 'react';
import type { PlanItem } from '../../../../shared/types';
import type { TreeNode } from '../../../utils/planHierarchy';
import { CARD_WIDTHS } from '../../../constants/layout';

interface VisibleBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface UseVisibleCanvasItemsDeps {
  itemsWithPositions: TreeNode[];
  collapsedGroupIds: Set<string>;
  groupLayoutInfo: {
    idealPositions: Map<string, { x: number; y: number }>;
  };
  getVisibleBounds: () => VisibleBounds | null;
  heightMap: Map<string, number>;
  selectedItemIds: Set<string>;
  focusedItemId: string | null;
  draggingGroupId: string | null;
  itemsByGroupId: Map<string, PlanItem[]>;
}

interface UseVisibleCanvasItemsReturn {
  visibleItems: TreeNode[];
  positionCorrectedItems: TreeNode[];
  viewportItems: TreeNode[];
  viewportSubtreeNodeCount: number;
}

export function useVisibleCanvasItems({
  itemsWithPositions,
  collapsedGroupIds,
  groupLayoutInfo,
  getVisibleBounds,
  heightMap,
  selectedItemIds,
  focusedItemId,
  draggingGroupId,
  itemsByGroupId,
}: UseVisibleCanvasItemsDeps): UseVisibleCanvasItemsReturn {
  // Filter out items in collapsed groups
  const visibleItems = useMemo(() => {
    return itemsWithPositions.filter(node => {
      if (!node.group_id) return true;
      return !collapsedGroupIds.has(node.group_id);
    });
  }, [itemsWithPositions, collapsedGroupIds]);

  // Apply computed ideal positions to grouped items so they render correctly
  // even before the snap-to-grid effect has a chance to persist positions to DB
  const positionCorrectedItems = useMemo(() => {
    const { idealPositions } = groupLayoutInfo;
    if (idealPositions.size === 0) return visibleItems;
    return visibleItems.map(node => {
      if (!node.group_id) return node;
      const idealPos = idealPositions.get(node.id);
      if (!idealPos) return node;
      return { ...node, position_x: idealPos.x, position_y: idealPos.y };
    });
  }, [visibleItems, groupLayoutInfo]);

  // Viewport culling: only render items whose bounding box intersects the visible area
  const viewportItems = useMemo(() => {
    const bounds = getVisibleBounds();
    if (!bounds) return positionCorrectedItems;

    const cardWidth = CARD_WIDTHS[0];
    const draggingIds = draggingGroupId
      ? new Set((itemsByGroupId.get(draggingGroupId) ?? []).map(i => i.id))
      : null;

    return positionCorrectedItems.filter(node => {
      if (selectedItemIds.has(node.id) || focusedItemId === node.id) return true;
      if (draggingIds?.has(node.id)) return true;

      const x = node.position_x ?? 0;
      const y = node.position_y ?? 0;
      const h = heightMap.get(node.id) ?? 80;

      return x + cardWidth > bounds.left &&
        x < bounds.right &&
        y + h > bounds.top &&
        y < bounds.bottom;
    });
  }, [positionCorrectedItems, getVisibleBounds, heightMap, selectedItemIds, focusedItemId, draggingGroupId, itemsByGroupId]);

  const viewportSubtreeNodeCount = useMemo(() => {
    let count = 0;
    const stack = [...viewportItems];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) continue;
      count += 1;
      if (node.children.length > 0) {
        stack.push(...node.children);
      }
    }
    return count;
  }, [viewportItems]);

  return {
    visibleItems,
    positionCorrectedItems,
    viewportItems,
    viewportSubtreeNodeCount,
  };
}
