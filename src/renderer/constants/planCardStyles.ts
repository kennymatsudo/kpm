import { CARD_WIDTHS, MAX_DEPTH } from './layout';

export { MAX_DEPTH };

/**
 * Depth-based styling configuration for plan cards.
 * Each level has distinct styling for visual hierarchy.
 */
export const depthStyles = {
} as const;

/**
 * Get styling for a specific depth, clamped to MAX_DEPTH.
 */
export function getStyleForDepth(depth: number) {
  const depthKey = Math.min(depth, MAX_DEPTH) as 0 | 1 | 2 | 3 | 4;
}
