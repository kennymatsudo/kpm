/**
 * Layout constants for PlanView components.
 */

/** Maximum nesting depth for plan items (0-indexed, so 4 = 5 levels) */
export const MAX_DEPTH = 4;

export interface PanelSizeConfig {
  storageKey: string;
  min: number;
  default: number;
  maxAbs: number;
  viewportFraction?: number;
  remainingMinWidth?: number;
  invertDrag?: boolean;
}

export const PANEL_SIZES = {
  sidebar: {
    storageKey: 'kpm-sidebar-width',
    min: 240,
    default: 240,
    maxAbs: 480,
  },
  planningChat: {
    storageKey: 'kpm-chat-width',
    min: 280,
    default: 384,
    maxAbs: 1600,
    viewportFraction: 0.75,
    remainingMinWidth: 480,
    invertDrag: true,
  },
  workspaceChat: {
    storageKey: 'kpm-workspace-chat-width',
    min: 320,
    default: 420,
    maxAbs: 1600,
    viewportFraction: 0.75,
    remainingMinWidth: 480,
    invertDrag: true,
  },
} as const satisfies Record<string, PanelSizeConfig>;
