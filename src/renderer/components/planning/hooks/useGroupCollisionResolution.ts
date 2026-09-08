import { useCallback } from 'react';
import { buildHierarchyTree, layoutGroup, type TreeNode } from '../../../utils/planHierarchy';
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
  tree: TreeNode[]
): { width: number; height: number } {
  const assignedItems = items.filter(item => item.group_id === group.id);

  if (assignedItems.length === 0) {
    return { width: group.width, height: group.height };
  }

  const { bounds } = layoutGroup(group, assignedItems, tree);

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

      // Build the full plan tree once for depth-aware height lookups
      const tree = buildHierarchyTree(plannedItems);

      // Find the changed group
      const changedGroup = groups.find(g => g.id === changedGroupId);
      if (!changedGroup) return;

      // Calculate new dimensions for the changed group. layoutGroup already
      // preserves a manually widened group's width and applies the
      // collapsed-height rule, so this is the group's final persisted size.
      const newDims = calculateGroupDimensions(changedGroup, plannedItems, tree);
      const assignedCount = plannedItems.filter(item => item.group_id === changedGroupId).length;

      const changedRect: Rect = {
        x: changedGroup.position_x ?? 0,
        y: changedGroup.position_y ?? 0,
        width: newDims.width,
        height: newDims.height,
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
          currentSize: { width: changedGroup.width, height: changedGroup.height },
          newDims,
          hasCollision,
        });
      }

      // Build list of all groups with their current positions and updated dimensions
      const allGroupsWithPositions: PositionableGroup[] = groups.map(group => {
        return {
          id: group.id,
          x: group.position_x ?? 0,
          y: group.position_y ?? 0,
          width: group.id === changedGroupId ? newDims.width : group.width,
          height: group.id === changedGroupId
            ? newDims.height
            : (group.is_collapsed ? GROUP_LAYOUT.COLLAPSED_HEIGHT : group.height),
        };
      });

      if (!hasCollision) {
        await updateGroupSize(changedGroupId, newDims.width, newDims.height);
        return;
      }

      // Resolve collisions (changed group stays put, others move)
      const collisionResolutions = resolveGroupCollisions(allGroupsWithPositions, changedGroupId);

      // Apply updates
      const updatePromises: Promise<unknown>[] = [];

      // Update the changed group's size
      updatePromises.push(updateGroupSize(changedGroupId, newDims.width, newDims.height));

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
