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
