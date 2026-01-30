export type ColorScheme = 'light' | 'dark';

/**
 * Core colors needed to define a theme.
 * All other colors are derived from these.
 */
export interface ThemeColors {
  colorScheme: ColorScheme;

  // Surface colors (backgrounds)
  surface0: string; // Main background
  surface1: string; // Cards, panels (darker in dark mode)
  surface2: string; // Elevated surfaces
  surface3: string; // Hover states
  surface4: string; // Active states
  surfaceElevated: string; // Modals, dropdowns

  // Text colors
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textMuted: string;

  // Accent color (primary brand color)
  accent: string;
  accentHover: string;

  // Semantic colors (optional - defaults provided)
  success?: string;
  warning?: string;
  danger?: string;
  info?: string;
  purple?: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  description: string;
  colors: ThemeColors;
  preview: {
    surface: string;
    accent: string;
    text: string;
  };
}

// ============================================
// Color Utility Functions
// ============================================

/** Parse hex color to RGB components */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/** Create rgba string from hex and alpha */
function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ============================================
// Theme Definitions
// ============================================

  colorScheme: 'dark',
};

  colorScheme: 'light',
  surface1: '#ffffff',
  surfaceElevated: '#ffffff',
};

export const THEMES: ThemeDefinition[] = [
  {
    id: 'system',
    name: 'System',
    description: 'Follow OS preference',
  },
  {
  },
];

export function getThemeById(id: ThemeId): ThemeDefinition | undefined {
  return THEMES.find((t) => t.id === id);
}

// ============================================
// CSS Variable Generation
// ============================================

/**
 * Generate all CSS variables for a theme from its core colors.
 * This ensures consistency across themes and reduces duplication.
 */
export function generateThemeVariables(colors: ThemeColors): Record<string, string> {
  const isDark = colors.colorScheme === 'dark';

  const borderColor = isDark ? '255, 255, 255' : '0, 0, 0';

  // Muted color opacity
  const mutedOpacity = isDark ? 0.18 : 0.12;
  const subtleOpacity = isDark ? 0.10 : 0.08;

  // Get semantic colors with defaults
  const success = colors.success ?? (isDark ? '#4ade80' : '#16a34a');
  const warning = colors.warning ?? (isDark ? '#fbbf24' : '#ca8a04');
  const danger = colors.danger ?? (isDark ? '#f87171' : '#dc2626');
  const info = colors.info ?? (isDark ? '#60a5fa' : '#2563eb');
  const purple = colors.purple ?? (isDark ? '#c084fc' : '#9333ea');

  return {
    // Color scheme
    'color-scheme': colors.colorScheme,

    // Surfaces
    '--color-surface-0': colors.surface0,
    '--color-surface-1': colors.surface1,
    '--color-surface-2': colors.surface2,
    '--color-surface-3': colors.surface3,
    '--color-surface-4': colors.surface4,
    '--color-surface-elevated': colors.surfaceElevated,

    // Text
    '--color-text-primary': colors.textPrimary,
    '--color-text-secondary': colors.textSecondary,
    '--color-text-tertiary': colors.textTertiary,
    '--color-text-muted': colors.textMuted,

    // Borders
    '--color-border-subtle': `rgba(${borderColor}, ${borderSubtleOpacity})`,
    '--color-border-default': `rgba(${borderColor}, ${borderDefaultOpacity})`,
    '--color-border-strong': `rgba(${borderColor}, ${borderStrongOpacity})`,

    // Accent
    '--color-accent': colors.accent,
    '--color-accent-hover': colors.accentHover,
    '--color-accent-muted': rgba(colors.accent, mutedOpacity),
    '--color-accent-subtle': rgba(colors.accent, subtleOpacity),

    // Semantic colors
    '--color-success': success,
    '--color-success-muted': rgba(success, mutedOpacity),
    '--color-warning': warning,
    '--color-warning-muted': rgba(warning, mutedOpacity),
    '--color-danger': danger,
    '--color-danger-muted': rgba(danger, mutedOpacity),
    '--color-info': info,
    '--color-info-muted': rgba(info, mutedOpacity),
    '--color-purple': purple,
    '--color-purple-subtle': rgba(purple, mutedOpacity),

    // Code background


    // Scrollbar
    '--scrollbar-thumb': rgba(colors.textPrimary, isDark ? 0.08 : 0.12),
    '--scrollbar-thumb-hover': rgba(colors.textPrimary, isDark ? 0.15 : 0.2),

    // Overlay
    '--overlay-color': isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.4)',

    '--terminal-cursor': colors.accent,
    '--terminal-selection-bg': rgba(colors.accent, 0.3),
  };
}

/**
 */
  const root = document.documentElement;

  for (const [key, value] of Object.entries(variables)) {
    if (key === 'color-scheme') {
      root.style.colorScheme = value;
    } else {
      root.style.setProperty(key, value);
    }
  }
}
