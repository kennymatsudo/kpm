import { useMemo } from 'react';
import type { PlanItem, Group } from '../../../../shared/types';
import { buildHierarchyTree, buildItemMaps, buildHeightMapFromTree, calculateGroupLayout, type TreeNode } from '../../../utils/planHierarchy';
import { AUTO_LAYOUT, GROUP_LAYOUT } from '../../../constants/layout';

interface UseCanvasHierarchyDeps {
  items: PlanItem[];
  groups: Group[];
  hierarchyTree?: TreeNode[];
}

interface UseCanvasHierarchyReturn {
  tree: TreeNode[];
  itemsWithPositions: TreeNode[];
  hasItemsNeedingLayout: boolean;
  itemsByGroupId: Map<string, PlanItem[]>;
  childrenMap: Map<string, string[]>;
  itemMap: Map<string, PlanItem>;
  heightMap: Map<string, number>;
  groupLayoutInfo: {
    bounds: Map<string, { x: number; y: number; width: number; height: number }>;
    idealPositions: Map<string, { x: number; y: number }>;
  };
  groupBounds: Map<string, { x: number; y: number; width: number; height: number }>;
  collapsedGroupIds: Set<string>;
}

export function useCanvasHierarchy({
  items,
  groups,
  hierarchyTree,
}: UseCanvasHierarchyDeps): UseCanvasHierarchyReturn {
  const tree = useMemo(() => hierarchyTree ?? buildHierarchyTree(items), [hierarchyTree, items]);

  const itemsWithPositions = useMemo(() => {
    const processNode = (node: TreeNode): TreeNode => {
      if (node.position_x !== null && node.position_y !== null) {
        return {
          ...node,
          children: node.children.map(child => processNode(child)),
        };
      }

      return {
        ...node,
        position_x: AUTO_LAYOUT.START_X,
        position_y: AUTO_LAYOUT.START_Y,
        children: node.children.map(child => processNode(child)),
      };
    };

    return tree.map(node => processNode(node));
  }, [tree]);

  const hasItemsNeedingLayout = useMemo(() => {
    return tree.some(node => node.position_x === null || node.position_y === null);
  }, [tree]);

  const itemsByGroupId = useMemo(() => {
    const map = new Map<string, PlanItem[]>();
    for (const item of items) {
      if (!item.group_id) continue;
      const list = map.get(item.group_id) ?? [];
      list.push(item);
      map.set(item.group_id, list);
    }
    return map;
  }, [items]);

  const { childrenMap, itemMap } = useMemo(() => buildItemMaps(items), [items]);
  const heightMap = useMemo(() => buildHeightMapFromTree(itemsWithPositions), [itemsWithPositions]);

  const groupLayoutInfo = useMemo(() => {
    const boundsMap = new Map<string, { x: number; y: number; width: number; height: number }>();
    const idealPositions = new Map<string, { x: number; y: number }>();

    for (const group of groups) {
      const assignedItems = itemsByGroupId.get(group.id) ?? [];

      if (assignedItems.length === 0) {
        boundsMap.set(group.id, {
          x: group.position_x,
          y: group.position_y,
          width: group.width,
          height: group.is_collapsed
            ? GROUP_LAYOUT.COLLAPSED_HEIGHT
            : group.height,
        });
        continue;
      }

      const { bounds, itemPositions } = calculateGroupLayout(
        group.id,
        { x: group.position_x, y: group.position_y },
        assignedItems,
        childrenMap,
        itemMap,
        heightMap,
        group.width
      );

      boundsMap.set(group.id, {
        x: bounds.x,
        y: bounds.y,
        width: Math.max(group.width, bounds.width),
        height: group.is_collapsed
          ? GROUP_LAYOUT.COLLAPSED_HEIGHT
          : bounds.height,
      });
      for (const [itemId, pos] of itemPositions) {
        idealPositions.set(itemId, pos);
      }
    }

    return { bounds: boundsMap, idealPositions };
  }, [groups, itemsByGroupId, childrenMap, itemMap, heightMap]);

  const groupBounds = groupLayoutInfo.bounds;

  const collapsedGroupIds = useMemo(() => {
    return new Set(groups.filter(g => g.is_collapsed).map(g => g.id));
  }, [groups]);

  return {
    tree,
    itemsWithPositions,
    hasItemsNeedingLayout,
    itemsByGroupId,
    childrenMap,
    itemMap,
    heightMap,
    groupLayoutInfo,
    groupBounds,
    collapsedGroupIds,
  };
}
