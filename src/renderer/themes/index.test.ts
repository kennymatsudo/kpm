import { describe, expect, it } from 'vitest';

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
      textPrimary: '#005661',
      textSecondary: '#71838e',
      textTertiary: '#8ca6a6',
      textMuted: '#a0abac',
      accent: '#009999',
      accentHover: '#008484',
    };

    expect(generateThemeVariables(colors)['--color-code-bg']).toBe('rgba(0, 153, 153, 0.08)');
  });
});
