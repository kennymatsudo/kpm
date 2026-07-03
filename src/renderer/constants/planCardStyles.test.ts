import { describe, it, expect } from 'vitest';
import {
  CARD_BOX_MODEL,
  PADDING_PX_BY_CLASS,
  TITLE_LINE_HEIGHT_PX_BY_CLASS,
  depthStyles,
  paddingPxForDepth,
  titleLineHeightPxForDepth,
} from './planCardStyles';

/**
 * Tailwind v4 scale for just the classes used by plan card physics.
 * Text utilities set font-size only; line-height is inherited from
 * `body { line-height: 1.5 }` (see src/index.css).
 */
const TAILWIND_SPACING_PX: Record<string, number> = {
  'p-2': 8,
  'p-1.5': 6,
  'mt-1.5': 6,
  'space-y-2': 8,
};

const TAILWIND_FONT_SIZE_PX: Record<string, number> = {
  'text-sm': 14,
  'text-xs': 12,
};

const BODY_LINE_HEIGHT_MULTIPLIER = 1.5;

describe('PADDING_PX_BY_CLASS', () => {
  it('matches Tailwind padding utility px values (top + bottom)', () => {
    expect(PADDING_PX_BY_CLASS['p-2']).toBe(TAILWIND_SPACING_PX['p-2'] * 2);
    expect(PADDING_PX_BY_CLASS['p-1.5']).toBe(TAILWIND_SPACING_PX['p-1.5'] * 2);
  });
});

describe('TITLE_LINE_HEIGHT_PX_BY_CLASS', () => {
  it('matches Tailwind text utility line-height px values', () => {
    expect(TITLE_LINE_HEIGHT_PX_BY_CLASS['text-sm']).toBe(
      TAILWIND_FONT_SIZE_PX['text-sm'] * BODY_LINE_HEIGHT_MULTIPLIER
    );
    expect(TITLE_LINE_HEIGHT_PX_BY_CLASS['text-xs']).toBe(
      TAILWIND_FONT_SIZE_PX['text-xs'] * BODY_LINE_HEIGHT_MULTIPLIER
    );
  });
});

describe('CARD_BOX_MODEL class/px pairs', () => {
  it('metadataRow.marginTop matches mt-1.5', () => {
    expect(CARD_BOX_MODEL.metadataRow.marginTop.className).toBe('mt-1.5');
    expect(CARD_BOX_MODEL.metadataRow.marginTop.px).toBe(TAILWIND_SPACING_PX['mt-1.5']);
  });

  it('description.marginTop matches mt-1.5', () => {
    expect(CARD_BOX_MODEL.description.marginTop.className).toBe('mt-1.5');
    expect(CARD_BOX_MODEL.description.marginTop.px).toBe(TAILWIND_SPACING_PX['mt-1.5']);
  });

  it('description.lineHeightPx matches text-xs line-height', () => {
    expect(CARD_BOX_MODEL.description.lineHeightPx).toBe(
      TAILWIND_FONT_SIZE_PX['text-xs'] * BODY_LINE_HEIGHT_MULTIPLIER
    );
  });

  it('childrenContainer.marginTop matches mt-1.5', () => {
    expect(CARD_BOX_MODEL.childrenContainer.marginTop.className).toBe('mt-1.5');
    expect(CARD_BOX_MODEL.childrenContainer.marginTop.px).toBe(TAILWIND_SPACING_PX['mt-1.5']);
  });

  it('childrenContainer.siblingGap matches space-y-2', () => {
    expect(CARD_BOX_MODEL.childrenContainer.siblingGap.className).toBe('space-y-2');
    expect(CARD_BOX_MODEL.childrenContainer.siblingGap.px).toBe(TAILWIND_SPACING_PX['space-y-2']);
  });
});

describe('paddingPxForDepth', () => {
  it('reads from depthStyles.padding for every depth', () => {
    for (const [depth, style] of Object.entries(depthStyles)) {
      expect(paddingPxForDepth(Number(depth))).toBe(PADDING_PX_BY_CLASS[style.padding]);
    }
  });

  it('clamps depths beyond MAX_DEPTH to the deepest configured style', () => {
    expect(paddingPxForDepth(10)).toBe(paddingPxForDepth(4));
  });
});

describe('titleLineHeightPxForDepth', () => {
  it('reads from depthStyles.titleSize for every depth', () => {
    for (const [depth, style] of Object.entries(depthStyles)) {
      expect(titleLineHeightPxForDepth(Number(depth))).toBe(TITLE_LINE_HEIGHT_PX_BY_CLASS[style.titleSize]);
    }
  });

  it('clamps depths beyond MAX_DEPTH to the deepest configured style', () => {
    expect(titleLineHeightPxForDepth(10)).toBe(titleLineHeightPxForDepth(4));
  });
});
