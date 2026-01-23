import { useCallback } from 'react';
import { buildItemMaps, calculateGroupLayout } from '../../../utils/planHierarchy';
import { checkCollisionWithObstacles, resolveGroupCollisions, type PositionableGroup, type Rect } from '../../../utils/collision';
import { GROUP_LAYOUT } from '../../../constants/layout';
import type { PlanItem, Group } from '../../../../shared/types';

interface UseGroupCollisionResolutionDeps {
  plannedItems: PlanItem[];
  groups: Group[];
  updateGroupPosition: (groupId: string, x: number, y: number) => Promise<unknown>;
  updateGroupSize: (groupId: string, width: number, height: number) => Promise<unknown>;
}

/**
 * Calculate group dimensions based on assigned items.
 * Returns the minimum width/height needed to contain all items.
 */
function calculateGroupDimensions(
  group: Group,
  items: PlanItem[],
  childrenMap: Map<string, string[]>,
  itemMap: Map<string, PlanItem>
): { width: number; height: number } {
  const assignedItems = items.filter(item => item.group_id === group.id);

  if (assignedItems.length === 0) {
    return { width: group.width, height: group.height };
  }

  const { bounds } = calculateGroupLayout(
    group.id,
    { x: group.position_x ?? 0, y: group.position_y ?? 0 },
    assignedItems,
    childrenMap,
    itemMap,
    undefined,
    group.width
  );

  return { width: bounds.width, height: bounds.height };
}

/**
 * Hook that provides a function to resolve group collisions after item assignments.
 *
 * Call `resolveCollisionsForGroup` after assigning items to a group to:
 * 1. Recalculate the group's dimensions based on its new items
 * 2. Check for collisions with other groups
 * 3. Push overlapping groups out of the way
 */
export function useGroupCollisionResolution({
  plannedItems,
  groups,
  updateGroupPosition,
  updateGroupSize,
}: UseGroupCollisionResolutionDeps) {
  return useCallback(
    async (changedGroupId: string) => {
      const shouldDebug = typeof window !== 'undefined' &&
        (window as unknown as { __DEBUG_GROUP_LAYOUT?: boolean }).__DEBUG_GROUP_LAYOUT === true;

      // Build item maps for hierarchy calculations
      const { childrenMap, itemMap } = buildItemMaps(plannedItems);

      // Find the changed group
      const changedGroup = groups.find(g => g.id === changedGroupId);
      if (!changedGroup) return;

      // Calculate new dimensions for the changed group
      const newDims = calculateGroupDimensions(changedGroup, plannedItems, childrenMap, itemMap);
      const currentWidth = changedGroup.width ?? newDims.width;
      const currentHeight = changedGroup.height ?? newDims.height;
      const effectiveDims = {
        width: Math.max(currentWidth, newDims.width),
      };
      const assignedCount = plannedItems.filter(item => item.group_id === changedGroupId).length;

      const collisionHeight = changedGroup.is_collapsed
        ? GROUP_LAYOUT.COLLAPSED_HEIGHT
        : effectiveDims.height;
      const changedRect: Rect = {
        x: changedGroup.position_x ?? 0,
        y: changedGroup.position_y ?? 0,
        width: effectiveDims.width,
        height: collisionHeight,
      };
      const obstacles: Rect[] = groups
        .filter((group) => group.id !== changedGroupId)
        .map((group) => ({
          x: group.position_x ?? 0,
          y: group.position_y ?? 0,
          width: group.width,
          height: group.is_collapsed ? GROUP_LAYOUT.COLLAPSED_HEIGHT : group.height,
        }));

      const hasCollision = checkCollisionWithObstacles(changedRect, obstacles);
      if (shouldDebug) {
        console.debug('[group-collision]', {
          groupId: changedGroupId,
          assignedCount,
          currentSize: { width: currentWidth, height: currentHeight },
          newDims,
          effectiveDims,
          hasCollision,
        });
      }

      // Build list of all groups with their current positions and updated dimensions
      const allGroupsWithPositions: PositionableGroup[] = groups.map(group => {
        return {
          id: group.id,
          x: group.position_x ?? 0,
          y: group.position_y ?? 0,
          width: group.id === changedGroupId ? effectiveDims.width : group.width,
          height: group.id === changedGroupId
            ? collisionHeight
            : (group.is_collapsed ? GROUP_LAYOUT.COLLAPSED_HEIGHT : group.height),
        };
      });

      if (!hasCollision) {
        await updateGroupSize(changedGroupId, effectiveDims.width, effectiveDims.height);
        return;
      }

      // Resolve collisions (changed group stays put, others move)
      const collisionResolutions = resolveGroupCollisions(allGroupsWithPositions, changedGroupId);

      // Apply updates
      const updatePromises: Promise<unknown>[] = [];

      // Update the changed group's size
      updatePromises.push(updateGroupSize(changedGroupId, effectiveDims.width, effectiveDims.height));

      // Update positions for any groups that needed to move due to collision
      for (const [groupId, newPos] of collisionResolutions) {
        updatePromises.push(updateGroupPosition(groupId, newPos.x, newPos.y));
      }

      // Note: Item repositioning within groups happens separately via auto-layout
      // or when the canvas re-renders with the new group dimensions

      await Promise.all(updatePromises);
    },
    [plannedItems, groups, updateGroupPosition, updateGroupSize]
  );
}
