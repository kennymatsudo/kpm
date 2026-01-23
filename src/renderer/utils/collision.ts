/**
 * Collision detection utilities for canvas layout.
 * Used by group dragging to detect overlaps with other groups and items.
 */

import { COLLISION } from '../constants/layout';

/**
 * Rectangle bounds for collision detection
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Check if two rectangles intersect (AABB collision test).
 *
 * @param a - First rectangle
 * @param b - Second rectangle
 * @param gap - Minimum gap between rectangles (default: COLLISION.MIN_GAP)
 * @returns true if rectangles overlap or are within gap distance
 */
export function rectsIntersect(a: Rect, b: Rect, gap = COLLISION.MIN_GAP): boolean {
  // Expand first rect by gap for minimum spacing check
  const expandedA = {
    x: a.x - gap,
    y: a.y - gap,
    width: a.width + gap * 2,
    height: a.height + gap * 2,
  };

  // Standard AABB intersection test
  return (
    expandedA.x < b.x + b.width &&
    expandedA.x + expandedA.width > b.x &&
    expandedA.y < b.y + b.height &&
    expandedA.y + expandedA.height > b.y
  );
}

/**
 * Check if a rectangle collides with any in a list of obstacles.
 *
 * @param rect - Rectangle to check
 * @param obstacles - List of obstacle rectangles
 * @param gap - Minimum gap between rectangles
 * @returns true if rect collides with any obstacle
 */
export function checkCollisionWithObstacles(
  rect: Rect,
  obstacles: Rect[],
  gap = COLLISION.MIN_GAP
): boolean {
  return obstacles.some(obstacle => rectsIntersect(rect, obstacle, gap));
}

/**
 * Direction for escape offset calculation
 */
type EscapeDirection = 'left' | 'right' | 'up' | 'down';

interface EscapeCandidate {
  direction: EscapeDirection;
  dx: number;
  dy: number;
  distance: number;
}

/**
 * Find the minimum offset needed to resolve collision, preferring shorter moves.
 * Returns the offset to apply to move the rect out of collision.
 *
 * @param rect - Rectangle to move
 * @param obstacles - Obstacles to avoid
 * @param gap - Minimum gap to maintain
 * @returns Offset { dx, dy } to apply, or { dx: 0, dy: 0 } if no collision
 */
export function findEscapeOffset(
  rect: Rect,
  obstacles: Rect[],
  gap = COLLISION.MIN_GAP
): { dx: number; dy: number } {
  // Collect escape candidates from all colliding obstacles
  const candidates: EscapeCandidate[] = [];
  const buffer = 1; // Extra pixel to ensure we clear the collision boundary

  for (const obstacle of obstacles) {
    // Expand obstacle by gap for spacing check
    const expandedObstacle = {
      x: obstacle.x - gap,
      y: obstacle.y - gap,
      width: obstacle.width + gap * 2,
      height: obstacle.height + gap * 2,
    };

    // Check if actually colliding
    if (
      rect.x < expandedObstacle.x + expandedObstacle.width &&
      rect.x + rect.width > expandedObstacle.x &&
      rect.y < expandedObstacle.y + expandedObstacle.height &&
      rect.y + rect.height > expandedObstacle.y
    ) {
      // Calculate escape distance in each direction
      const escapeLeft = expandedObstacle.x - (rect.x + rect.width) - buffer;
      const escapeRight = (expandedObstacle.x + expandedObstacle.width) - rect.x + buffer;
      const escapeUp = expandedObstacle.y - (rect.y + rect.height) - buffer;
      const escapeDown = (expandedObstacle.y + expandedObstacle.height) - rect.y + buffer;

      candidates.push(
        { direction: 'left', dx: escapeLeft, dy: 0, distance: Math.abs(escapeLeft) },
        { direction: 'right', dx: escapeRight, dy: 0, distance: Math.abs(escapeRight) },
        { direction: 'up', dx: 0, dy: escapeUp, distance: Math.abs(escapeUp) },
        { direction: 'down', dx: 0, dy: escapeDown, distance: Math.abs(escapeDown) },
      );
    }
  }

  if (candidates.length === 0) {
    return { dx: 0, dy: 0 };
  }

  const directionWeight: Record<EscapeDirection, number> = {
    down: 0,
    right: 1,
    left: 2,
    up: 3,
  };

  // Prefer down/right over up/left even if the move is larger.
  candidates.sort((a, b) => {
    const aPreferred = a.direction === 'down' || a.direction === 'right';
    const bPreferred = b.direction === 'down' || b.direction === 'right';
    if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
    if (a.distance !== b.distance) return a.distance - b.distance;
    return directionWeight[a.direction] - directionWeight[b.direction];
  });

  // Find the first escape direction that results in a valid position
  for (const candidate of candidates) {
    const newRect = {
      x: rect.x + candidate.dx,
      y: rect.y + candidate.dy,
      width: rect.width,
      height: rect.height,
    };

    if (!checkCollisionWithObstacles(newRect, obstacles, gap)) {
      return { dx: candidate.dx, dy: candidate.dy };
    }
  }

  // If no single direction works, use the smallest move
  // (This handles edge cases where multiple obstacles surround the rect)
  return { dx: candidates[0].dx, dy: candidates[0].dy };
}

/**
 * A positionable group for collision resolution
 */
export interface PositionableGroup {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Resolve all collisions between groups by pushing overlapping groups apart.
 * Uses iterative approach - each iteration pushes one group, then re-checks.
 *
 * @param groups - Array of groups with positions and dimensions
 * @param changedGroupId - Optional ID of the group that changed size (it stays put, others move)
 * @param gap - Minimum gap between groups
 * @returns Map of group IDs to their new positions, only for groups that moved
 */
export function resolveGroupCollisions(
  groups: PositionableGroup[],
  changedGroupId?: string,
  gap = COLLISION.MIN_GAP
): Map<string, { x: number; y: number }> {
  const positionChanges = new Map<string, { x: number; y: number }>();

  if (groups.length < 2) {
    return positionChanges;
  }

  // Create working copy of positions
  const workingPositions = new Map<string, { x: number; y: number }>();
  for (const group of groups) {
    workingPositions.set(group.id, { x: group.x, y: group.y });
  }

  // Build dimension map for quick lookup
  const dimensionMap = new Map<string, { width: number; height: number }>();
  for (const group of groups) {
    dimensionMap.set(group.id, { width: group.width, height: group.height });
  }

  // Iteratively resolve collisions (max 50 iterations to prevent infinite loops)
  const maxIterations = 50;
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let foundCollision = false;

    // Check each pair of groups for collision
    for (let i = 0; i < groups.length; i++) {
      const groupA = groups[i];
      const posA = workingPositions.get(groupA.id)!;
      const dimA = dimensionMap.get(groupA.id)!;
      const rectA: Rect = { x: posA.x, y: posA.y, width: dimA.width, height: dimA.height };

      for (let j = i + 1; j < groups.length; j++) {
        const groupB = groups[j];
        const posB = workingPositions.get(groupB.id)!;
        const dimB = dimensionMap.get(groupB.id)!;
        const rectB: Rect = { x: posB.x, y: posB.y, width: dimB.width, height: dimB.height };

        if (rectsIntersect(rectA, rectB, gap)) {
          foundCollision = true;

          // Decide which group to move:
          // - If one is the changedGroupId, move the other
          // - Otherwise, move the one on the right/bottom (preserve earlier positioned items)
          let moverGroup: PositionableGroup;
          let stationaryRect: Rect;

          if (changedGroupId === groupA.id) {
            moverGroup = groupB;
            stationaryRect = rectA;
          } else if (changedGroupId === groupB.id) {
            moverGroup = groupA;
            stationaryRect = rectB;
          } else {
            // Move the one that's further right or down
            if (posB.x > posA.x || (posB.x === posA.x && posB.y > posA.y)) {
              moverGroup = groupB;
              stationaryRect = rectA;
            } else {
              moverGroup = groupA;
              stationaryRect = rectB;
            }
          }

          const moverPos = workingPositions.get(moverGroup.id)!;
          const moverDim = dimensionMap.get(moverGroup.id)!;
          const moverRect: Rect = { x: moverPos.x, y: moverPos.y, width: moverDim.width, height: moverDim.height };

          // Find escape offset for the mover
          const offset = findEscapeOffset(moverRect, [stationaryRect], gap);

          if (offset.dx !== 0 || offset.dy !== 0) {
            workingPositions.set(moverGroup.id, {
              x: moverPos.x + offset.dx,
              y: moverPos.y + offset.dy,
            });
          }
        }
      }
    }

    if (!foundCollision) {
      break;
    }
  }

  // Build result map with only positions that changed
  for (const group of groups) {
    const originalPos = { x: group.x, y: group.y };
    const newPos = workingPositions.get(group.id)!;

    if (newPos.x !== originalPos.x || newPos.y !== originalPos.y) {
      positionChanges.set(group.id, newPos);
    }
  }

  return positionChanges;
}
