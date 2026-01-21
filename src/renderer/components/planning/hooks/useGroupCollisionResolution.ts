import { useCallback } from 'react';
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

  );

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
      // Build item maps for hierarchy calculations
      const { childrenMap, itemMap } = buildItemMaps(plannedItems);

      // Find the changed group
      const changedGroup = groups.find(g => g.id === changedGroupId);
      if (!changedGroup) return;

      // Calculate new dimensions for the changed group
      const newDims = calculateGroupDimensions(changedGroup, plannedItems, childrenMap, itemMap);

      // Build list of all groups with their current positions and updated dimensions
      const allGroupsWithPositions: PositionableGroup[] = groups.map(group => {
        return {
          id: group.id,
          x: group.position_x ?? 0,
          y: group.position_y ?? 0,
        };
      });

      // Resolve collisions (changed group stays put, others move)
      const collisionResolutions = resolveGroupCollisions(allGroupsWithPositions, changedGroupId);

      // Apply updates
      const updatePromises: Promise<unknown>[] = [];

      // Update the changed group's size

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
