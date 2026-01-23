import { useCallback } from 'react';
import {
  resolveGroupCollisions,
  checkCollisionWithObstacles,
  findEscapeOffset,
  type PositionableGroup,
  type Rect,
} from '../../../utils/collision';
import type { PlanItem, Group } from '../../../../shared/types';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

  id: string;
  height: number;
}

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
  plannedItems: PlanItem[];
  groups: Group[];
  updateItemPosition: (itemId: string, x: number, y: number) => Promise<void>;
  updateGroupPosition: (groupId: string, x: number, y: number) => Promise<unknown>;
  updateGroupSize?: (groupId: string, width: number, height: number) => Promise<unknown>;
}

// -----------------------------------------------------------------------------
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

  const { bounds } = calculateGroupLayout(
    group.id,
    assignedItems,
    childrenMap,
  );

  return { width: bounds.width, height: bounds.height };
}

/**
 */
  return useCallback(
    async (options: AutoLayoutOptions = {}) => {


      for (let i = 0; i < rootIds.length; i++) {
        }
      }

      for (const group of groups) {
        const hasPosition = group.position_x !== null && group.position_y !== null;

        if (shouldReposition) {
        } else if (hasPosition && group.position_x !== null && group.position_y !== null) {
            id: `group:${group.id}`,
            width: dims.width,
            x: group.position_x,
            y: group.position_y,
          });
        }
      }

        return;
      }

      const screenWidth = options.dimensions?.width ?? window.innerWidth;
      const effectiveZoom = options.effectiveZoom ?? 1;
      const canvasWidth = screenWidth / effectiveZoom;


      const marginX = 40;
      const marginY = 40;

      const centeredPositions = rawPositions.map(pos => ({
        id: pos.id,
        x: pos.x + offsetX,
        y: pos.y + offsetY,
      }));

        x: item.x,
        y: item.y,
        height: item.height,
      }));

      const resolvedPositions = centeredPositions.map(pos => {

        const rect: Rect = {
          x: pos.x,
          y: pos.y,
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

      for (const [groupId, newGroupPos] of groupNewPositions) {
        if (groupItems.length === 0) continue;

        const { itemPositions } = calculateGroupLayout(
          groupId,
          { x: newGroupPos.x, y: newGroupPos.y },
          groupItems,
        );

        for (const [itemId, pos] of itemPositions) {
          updatePromises.push(updateItemPosition(itemId, pos.x, pos.y));
        }
      }

      await Promise.all(updatePromises);
    },
  );
}
