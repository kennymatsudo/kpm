import { describe, expect, it } from 'vitest';

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

  it('emits all 21 core CSS variables for the new 22-token system', () => {
    const theme = getThemeById('graphite');
    expect(theme).toBeDefined();
    const vars = generateThemeVariables(theme!.colors);
    for (const name of REQUIRED_CSS_VARIABLES) {
      expect(vars[name], `missing ${name}`).toBeTruthy();
    }
  });

  it('passes through new token values verbatim', () => {
    const theme = getThemeById('graphite')!;
    const vars = generateThemeVariables(theme.colors);

    expect(vars['--color-surface-code']).toBe(theme.colors.surfaceCode);
    expect(vars['--color-surface-selected']).toBe(theme.colors.surfaceSelected);
    expect(vars['--color-text-on-accent']).toBe(theme.colors.textOnAccent);
    expect(vars['--color-accent-active']).toBe(theme.colors.accentActive);
    expect(vars['--color-focus-ring']).toBe(theme.colors.focusRing);
    expect(vars['--color-link']).toBe(theme.colors.link);
    expect(vars['--color-link-visited']).toBe(theme.colors.linkVisited);
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
