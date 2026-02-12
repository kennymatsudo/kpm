/**
 * Layout constants for PlanView components.
 * Keep these in sync when changing card dimensions or spacing.
 */

/** Maximum nesting depth for plan cards (0-indexed, so 4 = 5 levels) */
export const MAX_DEPTH = 4;

/** Card width at each depth level (uniform across all depths) */
export const CARD_WIDTHS = {
  0: 260,
  1: 260,
  2: 260,
  3: 260,
  4: 260,
} as const;

/** Auto-layout grid settings */
export const AUTO_LAYOUT = {
  /** Starting X position for auto-layout */
  START_X: 50,
  /** Starting Y position for auto-layout */
  START_Y: 50,
  /** Horizontal gap between columns */
  HORIZONTAL_GAP: 32,
  /** Vertical gap between cards */
  VERTICAL_GAP: 24,
  /** Number of columns in the grid */
  COLUMNS: 3,
  /** Grid size for default positioning (items without explicit positions) */
  GRID_SIZE: 292,
} as const;

/** Group layout settings - vertical-first with limited columns */
export const GROUP_LAYOUT = {
  /** Maximum number of columns within a group */
  MAX_COLUMNS: 3,
  /** Horizontal padding inside group container (left/right) */
  PADDING_X: 16,
  /** Vertical padding at top of group container (below header) */
  PADDING_TOP: 16,
  /** Vertical padding at bottom of group container */
  PADDING_BOTTOM: 16,
  /** Space for group header */
  HEADER_HEIGHT: 36,
  /** Height when group is collapsed (header + border padding) */
  COLLAPSED_HEIGHT: 40,
  /** Horizontal gap between items in group */
  HORIZONTAL_GAP: 16,
  /** Vertical gap between items in group */
  VERTICAL_GAP: 16,
  /** Estimated height for grid snapping (base card height) */
  GRID_CELL_HEIGHT: 60,
} as const;

/** Canvas zoom limits */
export const ZOOM = {
  MIN: 0.25,
  MAX: 2,
  /** Step size for zoom buttons */
  STEP: 0.25,
  /** Step size for Cmd/Ctrl+scroll zoom (finer control) */
  SCROLL_STEP: 0.02,
  /**
   * Base scale factor applied to zoom.
   * When user sees "100%", actual canvas scale = 1 * BASE = 0.75.
   * This allows more cards to fit at the default view while preserving
   * card proportions and readability.
   */
  BASE: 0.75,
} as const;

/** Default sidebar widths */
export const SIDEBAR = {
  /** Default collapsed sidebar width */
  COLLAPSED: 56,
  /** Default expanded sidebar width */
  DEFAULT: 256,
  /** Maximum sidebar width */
  MAX: 360,
} as const;

/** Collision detection settings */
export const COLLISION = {
  /** Minimum gap between groups and other elements */
  MIN_GAP: 20,
} as const;
