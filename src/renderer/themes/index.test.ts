import { describe, expect, it } from 'vitest';
import type { ThemeColors } from '../../shared/theme';
import {
  createMermaidThemeVariables,
  getThemeById,
  THEMES,
  type ThemeId,
} from './index';

const REQUIRED_THEME_FIELDS: (keyof ThemeColors)[] = [
  'colorScheme',
  'surface0',
  'surface1',
  'surface2',
  'surface3',
  'surface4',
  'surfaceElevated',
  'surfaceCode',
  'surfaceSelected',
  'textPrimary',
  'textSecondary',
  'textTertiary',
  'textMuted',
  'textOnAccent',
  'accent',
  'accentHover',
  'accentActive',
  'focusRing',
  'link',
  'linkVisited',
];

describe('createMermaidThemeVariables', () => {
  it.each<ThemeId>(['graphite', 'fog'])('maps %s tokens onto the mermaid base theme', (id) => {
    const theme = getThemeById(id)!;
    const vars = createMermaidThemeVariables(theme.colors);

    expect(vars.darkMode).toBe(theme.colors.colorScheme === 'dark');
    expect(vars.background).toBe(theme.colors.surface1);
    expect(vars.edgeLabelBackground).toBe(theme.colors.surface1);
    expect(vars.primaryTextColor).toBe(theme.colors.textPrimary);
    expect(vars.textColor).toBe(theme.colors.textPrimary);
    expect(vars.lineColor).toBe(theme.colors.textTertiary);
    expect(vars.fontFamily).toBe('var(--font-sans)');
  });

  it('blends node fills toward the accent as solid hex', () => {
    const theme = getThemeById('graphite')!;
    const vars = createMermaidThemeVariables(theme.colors);

    // Solid hex (no alpha) so mermaid's internal color math stays predictable.
    expect(vars.primaryColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(vars.primaryBorderColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(vars.primaryColor).not.toBe(theme.colors.surface1);
    expect(vars.primaryColor).not.toBe(theme.colors.accent);
  });

  it('derives extended tokens for custom themes that lack them', () => {
    const theme = getThemeById('fog')!;
    const {
      surfaceCode: _surfaceCode,
      surfaceSelected: _surfaceSelected,
      textOnAccent: _textOnAccent,
      accentActive: _accentActive,
      focusRing: _focusRing,
      link: _link,
      linkVisited: _linkVisited,
      ...legacyColors
    } = theme.colors;

    const vars = createMermaidThemeVariables(legacyColors);
    expect(vars.darkMode).toBe(false);
    expect(vars.background).toBe(theme.colors.surface1);
  });
});

describe('THEMES registry', () => {
  it('includes the new Graphite (dark) and Fog (light) defaults', () => {
    expect(getThemeById('graphite')).toBeDefined();
    expect(getThemeById('fog')).toBeDefined();
    expect(getThemeById('graphite')!.colors.colorScheme).toBe('dark');
    expect(getThemeById('fog')!.colors.colorScheme).toBe('light');
  });

  it.each<ThemeId>(['graphite', 'fog'])(
    'theme %s exposes all required ThemeColors fields',
    (id) => {
      const theme = THEMES.find((t) => t.id === id);
      expect(theme, `theme ${id} not registered`).toBeDefined();

      for (const field of REQUIRED_THEME_FIELDS) {
        const value = theme!.colors[field];
        expect(value, `theme ${id} missing field ${String(field)}`).toBeTruthy();
        expect(typeof value).toBe('string');
      }
    },
  );
});
