/**
 * Z-index scale for layering UI elements.
 *
 * Layers (low → high):
 *   canvas → panel → dropdown → taskIndicator → palette → modal → toast
 *
 * Within a layer, add small offsets (e.g. Z_INDEX.dropdown + 10 for submenus).
 */
export const Z_INDEX = {
  /** Canvas items: cards, groups, drag previews */
  canvas: {
    default: 0,
    selected: 1,
    dragging: 10,
    dragCard: 11,
  },
  /** Panels, sidebars, fixed bars */
  panel: 100,
  /** Dropdown menus, context menus */
  dropdown: 200,
  /** Background task indicator */
  taskIndicator: 300,
  /** Command palette, global search overlays */
  palette: 400,
  /** Modal dialogs */
  modal: 500,
  /** Toast notifications */
  toast: 600,
} as const;
