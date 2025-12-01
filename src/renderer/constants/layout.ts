/**
 * Layout constants for PlanView components.
 * Keep these in sync when changing card dimensions or spacing.
 */

/** Maximum nesting depth for plan cards (0-indexed, so 4 = 5 levels) */
export const MAX_DEPTH = 4;

export const CARD_WIDTHS = {
} as const;

/** Auto-layout grid settings */
export const AUTO_LAYOUT = {
  /** Starting X position for auto-layout */
  START_X: 50,
  /** Starting Y position for auto-layout */
  START_Y: 50,
  /** Horizontal gap between columns */
  /** Vertical gap between cards */
  /** Number of columns in the grid */
  /** Grid size for default positioning (items without explicit positions) */
} as const;

/** Canvas zoom limits */
export const ZOOM = {
  MIN: 0.25,
  MAX: 2,
  STEP: 0.25,
  SCROLL_STEP: 0.02,
} as const;

