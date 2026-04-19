import { CARD_WIDTHS, MAX_DEPTH } from './layout';

export { MAX_DEPTH };

/**
 * Depth-based styling configuration for plan cards.
 * Each level has distinct styling for visual hierarchy.
 * Accent colors are applied via CSS variables in index.css.
 */
export const depthStyles = {
  0: { width: CARD_WIDTHS[0], padding: 'p-2',   titleSize: 'text-sm', borderWidth: '' },
  1: { width: CARD_WIDTHS[1], padding: 'p-2',   titleSize: 'text-xs', borderWidth: '' },
  2: { width: CARD_WIDTHS[2], padding: 'p-1.5', titleSize: 'text-xs', borderWidth: '' },
  3: { width: CARD_WIDTHS[3], padding: 'p-1.5', titleSize: 'text-xs', borderWidth: '' },
  4: { width: CARD_WIDTHS[4], padding: 'p-1.5', titleSize: 'text-xs', borderWidth: '' },
} as const;

/**
 * Get styling for a specific depth, clamped to MAX_DEPTH.
 */
export function getStyleForDepth(depth: number) {
  const depthKey = Math.min(depth, MAX_DEPTH) as 0 | 1 | 2 | 3 | 4;
  return depthStyles[depthKey];
}
