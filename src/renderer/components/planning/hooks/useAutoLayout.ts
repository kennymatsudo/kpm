import { useCallback } from 'react';
import { CARD_WIDTHS, GROUP_LAYOUT } from '../../../constants/layout';
import { buildHierarchyWithHeights, buildItemMaps, calculateGroupLayout } from '../../../utils/planHierarchy';
import {
  resolveGroupCollisions,
  checkCollisionWithObstacles,
  findEscapeOffset,
  type PositionableGroup,
  type Rect,
} from '../../../utils/collision';
import { computeMacroLayoutWithElk } from '../../../utils/elkLayout';
import type { PlanItem, Group } from '../../../../shared/types';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface SizedItem {
  id: string;
  width: number;
  height: number;
}

interface PlacedItem extends SizedItem {
  x: number;
  y: number;
}

export interface AutoLayoutOptions {
  dimensions?: { width: number; height: number };
  /** If true, reposition ALL items. If false, only position items without positions. */
  forceFullLayout?: boolean;
  /** Item IDs to reposition even if they already have positions (e.g., newly unfiltered items) */
  repositionItemIds?: Set<string>;
  /** Current effective zoom level - used to calculate visible canvas area */
  effectiveZoom?: number;
}

interface AutoLayoutDeps {
  /** Visible items participating in root-level masonry placement. */
  plannedItems: PlanItem[];
  /** Full planned item set (including filtered/hidden items) for group sizing/positioning. */
  allPlannedItems?: PlanItem[];
  groups: Group[];
  updateItemPosition: (itemId: string, x: number, y: number) => Promise<void>;
  updateGroupPosition: (groupId: string, x: number, y: number) => Promise<unknown>;
  updateGroupSize?: (groupId: string, width: number, height: number) => Promise<unknown>;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Calculate group dimensions based on the items it contains,
 * using the shared utility function.
 */
function getGroupDimensions(
  group: Group,
  childrenMap: Map<string, string[]>,
  itemMap: Map<string, PlanItem>
): { width: number; height: number } {
  if (assignedItems.length === 0) {
    return { width: group.width, height: group.height };
  }

  // Collapsed groups use single-column width and collapsed height for layout.
  // This prevents a collapsed group from reserving multi-column space in the grid.
  if (group.is_collapsed) {
    return {
      width: CARD_WIDTHS[0] + GROUP_LAYOUT.PADDING_X * 2,
      height: GROUP_LAYOUT.COLLAPSED_HEIGHT,
    };
  }

  const { bounds } = calculateGroupLayout(
    group.id,
    { x: 0, y: 0 },
    assignedItems,
    childrenMap,
    itemMap,
    undefined,
    undefined
  );

  return { width: bounds.width, height: bounds.height };
}

// -----------------------------------------------------------------------------
// Hook
// -----------------------------------------------------------------------------

/**
 * Hook that provides an auto-layout function for arranging plan items.
 * Macro layout (ungrouped roots + group rectangles) is delegated to elkjs.
 * Group internals continue to use calculateGroupLayout's masonry packing.
 */
export function useAutoLayout({
  plannedItems,
  allPlannedItems,
  groups,
  updateItemPosition,
  updateGroupPosition,
  updateGroupSize,
}: AutoLayoutDeps) {
  return useCallback(
    async (options: AutoLayoutOptions = {}) => {
      const fullItems = allPlannedItems ?? plannedItems;
      const forceFullLayout = options.forceFullLayout ?? false;

      const { rootIds, rootHeights, itemMap } = buildHierarchyWithHeights(plannedItems);
      const { childrenMap: fullChildrenMap, itemMap: fullItemMap } = buildItemMaps(fullItems);

      // Separate ungrouped roots (participate in macro layout) from grouped items
      // (positioned by their group's internal layout).

      const toPosition: SizedItem[] = [];
      const positioned: PlacedItem[] = [];

      for (let i = 0; i < rootIds.length; i++) {
        const id = rootIds[i];
        if (groupedItemIds.has(id)) continue;

        const item = itemMap.get(id);
        const height = rootHeights[i];
        const hasPosition = item?.position_x !== null && item?.position_y !== null;
        const shouldReposition =
          forceFullLayout || options.repositionItemIds?.has(id) || !hasPosition;

        if (shouldReposition) {
          toPosition.push({ id, width: CARD_WIDTHS[0], height });
        } else if (hasPosition) {
          positioned.push({
            id,
            width: CARD_WIDTHS[0],
            height,
            x: item!.position_x!,
            y: item!.position_y!,
          });
        }
      }

      // Categorize groups the same way
      for (const group of groups) {
        const hasPosition = group.position_x !== null && group.position_y !== null;
        const shouldReposition = forceFullLayout || !hasPosition;

        if (shouldReposition) {
          toPosition.push({ id: `group:${group.id}`, width: dims.width, height: dims.height });
        } else if (hasPosition && group.position_x !== null && group.position_y !== null) {
          positioned.push({
            id: `group:${group.id}`,
            width: dims.width,
            height: dims.height,
            x: group.position_x,
            y: group.position_y,
          });
        }
      }

      if (toPosition.length === 0) {
        return;
      }

      const screenWidth = options.dimensions?.width ?? window.innerWidth;
      const effectiveZoom = options.effectiveZoom ?? 1;
      const canvasWidth = screenWidth / effectiveZoom;

      // Run elk on items needing placement.
      const elkResult = await computeMacroLayoutWithElk(toPosition, canvasWidth);
      const rawPositions = elkResult.positions;
      const elkBounds = elkResult.bounds;

      // Determine the offset that turns elk's (0,0)-anchored output into final
      // canvas coordinates. Full layout: center horizontally with a top margin.
      // Incremental: drop new items below existing content so we don't reshuffle.
      const marginX = 40;
      const marginY = 40;
      let offsetX: number;
      let offsetY: number;

      if (forceFullLayout || positioned.length === 0) {
        offsetX = Math.max(marginX, (canvasWidth - elkBounds.width) / 2);
        offsetY = marginY;
      } else {
        let existingMinX = Infinity;
        let existingMaxY = -Infinity;
        for (const p of positioned) {
          existingMinX = Math.min(existingMinX, p.x);
          existingMaxY = Math.max(existingMaxY, p.y + p.height);
        }
        offsetX = Number.isFinite(existingMinX) ? existingMinX : marginX;
        offsetY = Number.isFinite(existingMaxY) ? existingMaxY + marginY : marginY;
      }

      const centeredPositions = rawPositions.map(pos => ({
        id: pos.id,
        x: pos.x + offsetX,
        y: pos.y + offsetY,
      }));

      // Collision-resolution safety net: nudge any new item that lands on top of
      // an already-positioned obstacle. Elk avoids collisions among items it
      // lays out, but in incremental mode it doesn't see the existing items.
      const obstacles: Rect[] = positioned.map(item => ({
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
      }));

      const toPositionMap = new Map(toPosition.map(item => [item.id, item]));

      const resolvedPositions = centeredPositions.map(pos => {
        if (pos.id.startsWith('group:')) return pos; // groups handled by resolveGroupCollisions

        const sized = toPositionMap.get(pos.id);
        const rect: Rect = {
          x: pos.x,
          y: pos.y,
          width: sized?.width ?? CARD_WIDTHS[0],
          height: sized?.height ?? 100,
        };

        if (checkCollisionWithObstacles(rect, obstacles)) {
          const offset = findEscapeOffset(rect, obstacles);
          const resolvedPos = { ...pos, x: pos.x + offset.dx, y: pos.y + offset.dy };
          obstacles.push({
            x: resolvedPos.x,
            y: resolvedPos.y,
            width: rect.width,
            height: rect.height,
          });
          return resolvedPos;
        }

        obstacles.push(rect);
        return pos;
      });

      const updatePromises: Promise<unknown>[] = [];
      const groupNewPositions = new Map<string, { x: number; y: number; width: number; height: number }>();

      for (const { id, x, y } of resolvedPositions) {
        if (id.startsWith('group:')) {
          const groupId = id.replace('group:', '');
          const dims = groupDimensionsMap.get(groupId) ?? { width: 300, height: 200 };
          groupNewPositions.set(groupId, { x, y, ...dims });
        } else {
          updatePromises.push(updateItemPosition(id, x, y));
        }
      }

      // Resolve any collisions between groups, including ones that didn't move.
      const allGroupsWithPositions: PositionableGroup[] = groups.map(group => {
        const newPos = groupNewPositions.get(group.id);
        const dims = groupDimensionsMap.get(group.id) ?? { width: group.width, height: group.height };
        return {
          id: group.id,
          x: newPos?.x ?? group.position_x ?? 0,
          y: newPos?.y ?? group.position_y ?? 0,
          width: dims.width,
          height: dims.height,
        };
      });

      const collisionResolutions = resolveGroupCollisions(allGroupsWithPositions);
      for (const [groupId, newPos] of collisionResolutions) {
        const existing = groupNewPositions.get(groupId);
        const dims = groupDimensionsMap.get(groupId) ?? { width: 300, height: 200 };
        groupNewPositions.set(groupId, {
          x: newPos.x,
          y: newPos.y,
          width: existing?.width ?? dims.width,
          height: existing?.height ?? dims.height,
        });
      }

      for (const [groupId, pos] of groupNewPositions) {
        updatePromises.push(updateGroupPosition(groupId, pos.x, pos.y));
        if (updateGroupSize) {
          updatePromises.push(updateGroupSize(groupId, pos.width, pos.height));
        }
      }

      // Reposition items inside groups that were moved.
      for (const [groupId, newGroupPos] of groupNewPositions) {
        if (groupItems.length === 0) continue;

        const { itemPositions } = calculateGroupLayout(
          groupId,
          { x: newGroupPos.x, y: newGroupPos.y },
          groupItems,
          fullChildrenMap,
          fullItemMap,
          undefined,
          newGroupPos.width
        );

        for (const [itemId, pos] of itemPositions) {
          updatePromises.push(updateItemPosition(itemId, pos.x, pos.y));
        }
      }

      await Promise.all(updatePromises);
    },
    [plannedItems, allPlannedItems, groups, updateItemPosition, updateGroupPosition, updateGroupSize]
  );
}
