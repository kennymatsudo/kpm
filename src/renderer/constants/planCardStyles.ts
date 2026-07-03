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

/**
 * Box-model spec for plan card physics: the single source of truth for both
 * the DOM classes PlanCard.tsx renders and the pixel heights planHierarchy.ts
 * computes for masonry layout. Heights are calculated, not measured — every
 * dimension here must correspond to a class actually applied in PlanCard.tsx.
 */
interface ClassPx { className: string; px: number }

/** Tailwind padding class -> total (top + bottom) px, for the classes `depthStyles.padding` uses. */
export const PADDING_PX_BY_CLASS: Record<'p-2' | 'p-1.5', number> = {
  'p-2': 16,
  'p-1.5': 12,
};

/** Tailwind title size class -> line-height px, for the classes `depthStyles.titleSize` uses. */
export const TITLE_LINE_HEIGHT_PX_BY_CLASS: Record<'text-sm' | 'text-xs', number> = {
  'text-sm': 21,
  'text-xs': 18,
};

export interface CardBoxModel {
  /** Metadata row: top margin + badge/selector row content height */
  metadataRow: { marginTop: ClassPx; contentPx: number };
  /** Description row: only reserved at depth <= 1 */
  description: { marginTop: ClassPx; lineHeightPx: number; reservedAtDepth: (depth: number) => boolean };
  /** Children container: top margin + toggle row + gap between siblings */
  childrenContainer: { marginTop: ClassPx; toggleRowPx: number; siblingGap: ClassPx };
}

export const CARD_BOX_MODEL: CardBoxModel = {
  metadataRow: {
    marginTop: { className: 'mt-1.5', px: 6 },
    contentPx: 20,
  },
  description: {
    marginTop: { className: 'mt-1.5', px: 6 },
    lineHeightPx: 18, // text-xs line-clamp-1
    reservedAtDepth: (depth: number) => depth <= 1,
  },
  childrenContainer: {
    marginTop: { className: 'mt-1.5', px: 6 },
    toggleRowPx: 16,
    siblingGap: { className: 'space-y-2', px: 8 },
  },
};

/** Total top+bottom padding in px for a given depth, from `depthStyles.padding`. */
export function paddingPxForDepth(depth: number): number {
  return PADDING_PX_BY_CLASS[getStyleForDepth(depth).padding];
}

/** Title row line-height in px for a given depth, from `depthStyles.titleSize`. */
export function titleLineHeightPxForDepth(depth: number): number {
  return TITLE_LINE_HEIGHT_PX_BY_CLASS[getStyleForDepth(depth).titleSize];
}
