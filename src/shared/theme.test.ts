import { describe, expect, it } from 'vitest';
import {
  DEPTH_COLOR_DEFAULTS,
  SEMANTIC_COLOR_DEFAULTS,
  generateThemeVariables,
  graphiteColors,
  resolveDepthColors,
  resolveSemanticColors,
  withDerivedExtendedTokens,
  type PartialThemeColors,
  type ThemeColors,
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
  it('derives light theme inline code backgrounds from the active accent', () => {
    const colors: ThemeColors = {
      colorScheme: 'light',
      surface0: '#f4f6f6',
      surface1: '#e7f2f3',
      surface2: '#e0eff1',
      surface3: '#d1eafa',
      surface4: '#b6e1e7',
      surfaceElevated: '#e0eff1',
      surfaceCode: '#d1eafa',
      surfaceSelected: 'rgba(0, 153, 153, 0.10)',
      textPrimary: '#005661',
      textSecondary: '#71838e',
      textTertiary: '#8ca6a6',
      textMuted: '#a0abac',
      textOnAccent: '#ffffff',
      accent: '#009999',
      accentHover: '#008484',
      accentActive: '#007878',
      focusRing: 'rgba(0, 153, 153, 0.35)',
      link: '#009999',
      linkVisited: '#7a4fa0',
    };

    expect(generateThemeVariables(colors)['--color-code-bg']).toBe('rgba(0, 153, 153, 0.08)');
  });

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
