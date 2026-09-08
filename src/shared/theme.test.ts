import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DEPTH_COLOR_DEFAULTS,
  SEMANTIC_COLOR_DEFAULTS,
  fogColors,
  generateThemeVariables,
  graphiteColors,
  resolveDepthColors,
  resolveSemanticColors,
  withDerivedExtendedTokens,
  type PartialThemeColors,
} from './theme';

const REQUIRED_CSS_VARIABLES = [
  '--color-surface-0',
  '--color-surface-1',
  '--color-surface-2',
  '--color-surface-3',
  '--color-surface-4',
  '--color-surface-elevated',
  '--color-surface-code',
  '--color-surface-selected',
  '--color-text-primary',
  '--color-text-secondary',
  '--color-text-tertiary',
  '--color-text-muted',
  '--color-text-on-accent',
  '--color-accent',
  '--color-accent-hover',
  '--color-accent-active',
  '--color-accent-muted',
  '--color-accent-subtle',
  '--color-focus-ring',
  '--color-link',
  '--color-link-visited',
];

/** A relaxed color set that sets none of the optional semantic/depth tokens. */
const bareDarkColors: PartialThemeColors = {
  colorScheme: 'dark',
  surface0: '#000000',
  surface1: '#111111',
  surface2: '#222222',
  surface3: '#333333',
  surface4: '#444444',
  surfaceElevated: '#151515',
  textPrimary: '#ffffff',
  textSecondary: '#dddddd',
  textTertiary: '#bbbbbb',
  textMuted: '#888888',
  accent: '#6ea8fe',
  accentHover: '#8bbcff',
};

describe('resolveSemanticColors', () => {
  it('fills unset semantic tokens from the scheme defaults', () => {
    expect(resolveSemanticColors(bareDarkColors, true)).toEqual(SEMANTIC_COLOR_DEFAULTS.dark);
    expect(resolveSemanticColors(bareDarkColors, false)).toEqual(SEMANTIC_COLOR_DEFAULTS.light);
  });

  it('passes through explicitly set semantic tokens', () => {
    expect(resolveSemanticColors({ ...bareDarkColors, danger: '#abcdef' }, true).danger).toBe('#abcdef');
  });
});

describe('resolveDepthColors', () => {
  it('fills unset depth tokens from the scheme defaults', () => {
    expect(resolveDepthColors(bareDarkColors, true)).toEqual(DEPTH_COLOR_DEFAULTS.dark);
    expect(resolveDepthColors(bareDarkColors, false)).toEqual(DEPTH_COLOR_DEFAULTS.light);
  });

  it('keeps depth1 mirroring info and depth3 mirroring purple', () => {
    expect(DEPTH_COLOR_DEFAULTS.dark.depth1).toBe(SEMANTIC_COLOR_DEFAULTS.dark.info);
    expect(DEPTH_COLOR_DEFAULTS.dark.depth3).toBe(SEMANTIC_COLOR_DEFAULTS.dark.purple);
    expect(DEPTH_COLOR_DEFAULTS.light.depth1).toBe(SEMANTIC_COLOR_DEFAULTS.light.info);
    expect(DEPTH_COLOR_DEFAULTS.light.depth3).toBe(SEMANTIC_COLOR_DEFAULTS.light.purple);
  });

  it('resolves the dark depth2 default to success (regression: was the #4abe80 typo)', () => {
    expect(resolveDepthColors(bareDarkColors, true).depth2).toBe('#4ade80');
    expect(resolveSemanticColors(bareDarkColors, true).success).toBe('#4ade80');
    expect(resolveDepthColors(bareDarkColors, true).depth2).toBe(
      resolveSemanticColors(bareDarkColors, true).success,
    );
  });
});

describe('generateThemeVariables', () => {
  it('emits all core CSS variables for the 22-token system', () => {
    const vars = generateThemeVariables(graphiteColors);
    for (const name of REQUIRED_CSS_VARIABLES) {
      expect(vars[name], `missing ${name}`).toBeTruthy();
    }
  });

  it('passes through new token values verbatim', () => {
    const vars = generateThemeVariables(graphiteColors);

    expect(vars['--color-surface-code']).toBe(graphiteColors.surfaceCode);
    expect(vars['--color-surface-selected']).toBe(graphiteColors.surfaceSelected);
    expect(vars['--color-text-on-accent']).toBe(graphiteColors.textOnAccent);
    expect(vars['--color-accent-active']).toBe(graphiteColors.accentActive);
    expect(vars['--color-focus-ring']).toBe(graphiteColors.focusRing);
    expect(vars['--color-link']).toBe(graphiteColors.link);
    expect(vars['--color-link-visited']).toBe(graphiteColors.linkVisited);
  });

  it('picks the on-danger foreground by contrast ratio, not by luminance threshold', () => {
    // Graphite's danger is a pale pink: white on it is only ~2.5:1, so the
    // foreground must go dark even though the fill reads as "not light".
    expect(generateThemeVariables(graphiteColors)['--color-text-on-danger']).toBe('#0e0f12');
    expect(generateThemeVariables(fogColors)['--color-text-on-danger']).toBe('#ffffff');
  });

  it('derives an on-accent foreground matching what the built-in themes declare', () => {
    expect(withDerivedExtendedTokens({ ...graphiteColors, textOnAccent: undefined }).textOnAccent)
      .toBe(graphiteColors.textOnAccent);
    expect(withDerivedExtendedTokens({ ...fogColors, textOnAccent: undefined }).textOnAccent)
      .toBe(fogColors.textOnAccent);
  });

  it('uses the fixed dark depth2 default for a theme without depth overrides', () => {
    // graphite declares no depth tokens, so depth2 falls back to the dark default.
    expect(generateThemeVariables(graphiteColors)['--color-depth-2']).toBe('#4ade80');
  });
});

describe('withDerivedExtendedTokens', () => {
  it('fills the 7 extended tokens on a partial color set', () => {
    const filled = withDerivedExtendedTokens(bareDarkColors);
    expect(filled.surfaceCode).toBeTruthy();
    expect(filled.surfaceSelected).toBeTruthy();
    expect(filled.textOnAccent).toBeTruthy();
    expect(filled.accentActive).toBeTruthy();
    expect(filled.focusRing).toBeTruthy();
    expect(filled.link).toBe(bareDarkColors.accent);
    expect(filled.linkVisited).toBeTruthy();
  });

  it('preserves already-set extended tokens', () => {
    const filled = withDerivedExtendedTokens({ ...bareDarkColors, link: '#123456' });
    expect(filled.link).toBe('#123456');
  });
});

describe('index.css crash-safety background', () => {
  it('keeps the :root fallback background in sync with graphiteColors.surface0', () => {
    const cssPath = fileURLToPath(new URL('../renderer/index.css', import.meta.url));
    const css = readFileSync(cssPath, 'utf8');

    const rootRuleMatch = /:root\s*\{([^}]*)\}/.exec(css);
    expect(rootRuleMatch, ':root rule not found in index.css').toBeTruthy();

    const backgroundMatch = /background:\s*(#[0-9a-fA-F]{6})\s*;/.exec(rootRuleMatch![1]);
    expect(backgroundMatch, 'background declaration not found in :root').toBeTruthy();

    expect(backgroundMatch![1].toLowerCase()).toBe(graphiteColors.surface0.toLowerCase());
  });
});

// ============================================
// WCAG contrast regression matrix
// ============================================
//
// Each prior audit found one more token pairing that was never contrast-checked
// (a semantic color against a hover surface, a link against a panel, ...). This
// suite enumerates every pairing the design system actually composites, resolved
// through generateThemeVariables itself (not hand-copied hex), so a palette edit
// that regresses contrast fails here instead of in the next audit.

interface RGB {
  r: number;
  g: number;
  b: number;
}
interface RGBA extends RGB {
  a: number;
}

/** Parse a `#rrggbb` or `rgba(r, g, b[, a])` CSS color string, as emitted by generateThemeVariables. */
function parseColor(css: string): RGBA {
  const hex = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(css.trim());
  if (hex) {
    return { r: parseInt(hex[1], 16), g: parseInt(hex[2], 16), b: parseInt(hex[3], 16), a: 1 };
  }
  const rgbaMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(css.trim());
  if (rgbaMatch) {
    return {
      r: Number(rgbaMatch[1]),
      g: Number(rgbaMatch[2]),
      b: Number(rgbaMatch[3]),
      a: rgbaMatch[4] === undefined ? 1 : Number(rgbaMatch[4]),
    };
  }
  throw new Error(`Unrecognized color format: ${css}`);
}

/** Flatten a (possibly translucent) foreground over an opaque background per the alpha-compositing formula. */
function compositeOver(foreground: string, background: string): RGB {
  const fg = parseColor(foreground);
  if (fg.a >= 1) return fg;
  const bg = parseColor(background);
  const blend = (f: number, b: number) => f * fg.a + b * (1 - fg.a);
  return { r: blend(fg.r, bg.r), g: blend(fg.g, bg.g), b: blend(fg.b, bg.b) };
}

/** WCAG relative luminance (not exported from theme.ts, so reimplemented here). */
function relativeLuminanceOf({ r, g, b }: RGB): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio of a foreground token over a background token, compositing either side first. */
function contrastRatio(foreground: string, background: string): number {
  const fg = compositeOver(foreground, background);
  const bg = compositeOver(background, background);
  const l1 = relativeLuminanceOf(fg);
  const l2 = relativeLuminanceOf(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const BODY_TEXT_MIN = 4.5;
const UI_COMPONENT_MIN = 3;

const ALL_SURFACES = [
  '--color-surface-0',
  '--color-surface-1',
  '--color-surface-2',
  '--color-surface-3',
  '--color-surface-elevated',
  '--color-surface-code',
];
const CORE_SURFACES = ['--color-surface-0', '--color-surface-1', '--color-surface-2', '--color-surface-3'];
const LINK_SURFACES = ['--color-surface-0', '--color-surface-1', '--color-surface-2'];
const TEXT_LADDER = ['--color-text-primary', '--color-text-secondary', '--color-text-tertiary', '--color-text-muted'];
const DEPTH_TOKENS = ['--color-depth-0', '--color-depth-1', '--color-depth-2', '--color-depth-3', '--color-depth-4'];

/** Each semantic/accent foreground paired with the fill it sits on as badge text. */
const SEMANTIC_FILLS: [fg: string, fill: string][] = [
  ['--color-success', '--color-success-muted'],
  ['--color-warning', '--color-warning-muted'],
  ['--color-danger', '--color-danger-muted'],
  ['--color-info', '--color-info-muted'],
  ['--color-purple', '--color-purple-subtle'],
  ['--color-accent', '--color-accent-muted'],
];

interface ContrastPair {
  category: string;
  fg: string;
  bg: string;
  min: number;
}

const CONTRAST_PAIRS: ContrastPair[] = [
  ...TEXT_LADDER.flatMap((fg) =>
    ALL_SURFACES.map((bg) => ({ category: 'text ladder vs surface', fg, bg, min: BODY_TEXT_MIN })),
  ),
  ...SEMANTIC_FILLS.map(([fg, bg]) => ({ category: 'semantic vs own fill', fg, bg, min: BODY_TEXT_MIN })),
  ...SEMANTIC_FILLS.flatMap(([fg]) =>
    CORE_SURFACES.map((bg) => ({ category: 'semantic vs surface', fg, bg, min: BODY_TEXT_MIN })),
  ),
  { category: 'accent vs accent-subtle', fg: '--color-accent', bg: '--color-accent-subtle', min: BODY_TEXT_MIN },
  ...['--color-link', '--color-link-visited'].flatMap((fg) =>
    LINK_SURFACES.map((bg) => ({ category: 'link vs surface', fg, bg, min: BODY_TEXT_MIN })),
  ),
  { category: 'text-on-fill', fg: '--color-text-on-accent', bg: '--color-accent', min: BODY_TEXT_MIN },
  { category: 'text-on-fill', fg: '--color-text-on-danger', bg: '--color-danger', min: BODY_TEXT_MIN },
  ...CORE_SURFACES.map((bg) => ({ category: 'focus-ring vs surface', fg: '--color-focus-ring', bg, min: UI_COMPONENT_MIN })),
  { category: 'scrollbar-thumb vs surface', fg: '--scrollbar-thumb', bg: '--color-surface-1', min: UI_COMPONENT_MIN },
  ...DEPTH_TOKENS.flatMap((fg) =>
    ['--color-surface-elevated', '--color-surface-0'].map((bg) => ({
      category: 'depth vs surface',
      fg,
      bg,
      min: UI_COMPONENT_MIN,
    })),
  ),
];

describe('WCAG contrast regression matrix', () => {
  const palettes = [
    { palette: 'graphite', vars: generateThemeVariables(graphiteColors) },
    { palette: 'fog', vars: generateThemeVariables(fogColors) },
  ];

  const cases = palettes.flatMap(({ palette, vars }) => CONTRAST_PAIRS.map((pair) => ({ palette, vars, ...pair })));

  it.each(cases)('$palette: $fg vs $bg clears $min:1 ($category)', ({ vars, fg, bg, min, palette, category }) => {
    const measured = contrastRatio(vars[fg], vars[bg]);
    expect(
      measured,
      `${palette} ${fg} vs ${bg} (${category}) measured ${measured.toFixed(2)}:1, needs >= ${min}:1`,
    ).toBeGreaterThanOrEqual(min);
  });
});
