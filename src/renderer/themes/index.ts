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

  // Plan card depth colors (optional - defaults provided)
  depth0?: string;
  depth1?: string;
  depth2?: string;
  depth3?: string;
  depth4?: string;
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

/** Lighten a hex color by mixing with white. factor 0 = original, 1 = white */
function lighten(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(hex);
  const l = (v: number) => Math.round(v + (255 - v) * factor);
  return `#${[l(r), l(g), l(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
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
  {
];

export function getThemeById(id: ThemeId): ThemeDefinition | undefined {
  return THEMES.find((t) => t.id === id);
}

// ============================================
// Dark Terminal Base (used for light themes)
// ============================================

/** Standard dark terminal palette — light themes use this so CLI output stays readable. */
const DARK_TERMINAL_BASE = {
  bg: '#1a1a1a',
  bgElevated: '#1f1f1f',
  fg: '#f5f5f5',
  black: '#141414',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#f5f5f5',
  brightBlack: '#525252',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#ffffff',
};

// ============================================
// CSS Variable Generation
// ============================================

/**
 * Generate all CSS variables for a theme from its core colors.
 * This ensures consistency across themes and reduces duplication.
 */
export function generateThemeVariables(colors: ThemeColors): Record<string, string> {
  const isDark = colors.colorScheme === 'dark';

  // Border opacity based on color scheme — borders are primary visual separators
  const borderSubtleOpacity = isDark ? 0.04 : 0.08;
  const borderDefaultOpacity = isDark ? 0.08 : 0.12;
  const borderStrongOpacity = isDark ? 0.14 : 0.18;
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

  // Depth colors for plan card hierarchy
  const depth0 = colors.depth0 ?? (isDark ? '#818cf8' : '#6366f1');
  const depth1 = colors.depth1 ?? (isDark ? '#60a5fa' : '#2563eb');
  const depth2 = colors.depth2 ?? (isDark ? '#4abe80' : '#16a34a');
  const depth3 = colors.depth3 ?? (isDark ? '#c084fc' : '#9333ea');
  const depth4 = colors.depth4 ?? (isDark ? '#f472b6' : '#db2777');

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

    // Depth colors (plan card hierarchy)
    '--color-depth-0': depth0,
    '--color-depth-1': depth1,
    '--color-depth-2': depth2,
    '--color-depth-3': depth3,
    '--color-depth-4': depth4,

    // Code background

    // Shadows — minimal, structural only (layers 0-4 use zero shadows)
    '--shadow-xs': 'none',
    '--shadow-sm': isDark ? `0 1px 2px rgba(0, 0, 0, 0.15)` : `0 1px 2px rgba(0, 0, 0, 0.06)`,
    '--shadow-md': isDark ? `0 2px 4px rgba(0, 0, 0, 0.2)` : `0 2px 4px rgba(0, 0, 0, 0.08)`,
    '--shadow-lg': isDark ? `0 4px 8px rgba(0, 0, 0, 0.25)` : `0 4px 8px rgba(0, 0, 0, 0.1)`,
    '--shadow-xl': isDark ? `0 4px 8px rgba(0, 0, 0, 0.25)` : `0 4px 8px rgba(0, 0, 0, 0.1)`,
    '--shadow-glow': 'none',
    '--shadow-inset': 'none',
    '--shadow-card': 'none',
    '--shadow-card-hover': 'none',

    // Canvas dots — subtle orientation cues
    '--canvas-dot-color': rgba(colors.textPrimary, 0.02),

    // Scrollbar
    '--scrollbar-thumb': rgba(colors.textPrimary, isDark ? 0.08 : 0.12),
    '--scrollbar-thumb-hover': rgba(colors.textPrimary, isDark ? 0.15 : 0.2),

    // Overlay
    '--overlay-color': isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.4)',

    // Terminal — dark themes use their own palette; light themes force dark base
    ...(isDark
      ? {
          '--terminal-bg': colors.surface0,
          '--terminal-bg-elevated': colors.surfaceElevated,
          '--terminal-fg': colors.textPrimary,
          '--terminal-cursor-accent': colors.surface0,
          '--terminal-black': colors.surface1,
          '--terminal-red': danger,
          '--terminal-green': success,
          '--terminal-yellow': warning,
          '--terminal-blue': info,
          '--terminal-magenta': purple,
          '--terminal-cyan': '#22d3ee',
          '--terminal-white': colors.textPrimary,
          '--terminal-bright-black': colors.textMuted,
          '--terminal-bright-red': lighten(danger, 0.2),
          '--terminal-bright-green': lighten(success, 0.2),
          '--terminal-bright-yellow': lighten(warning, 0.2),
          '--terminal-bright-blue': lighten(info, 0.2),
          '--terminal-bright-magenta': lighten(purple, 0.2),
          '--terminal-bright-cyan': '#67e8f9',
          '--terminal-bright-white': '#ffffff',
          '--terminal-grid-color': rgba(colors.textPrimary, 0.1),
        }
      : {
          '--terminal-bg': DARK_TERMINAL_BASE.bg,
          '--terminal-bg-elevated': DARK_TERMINAL_BASE.bgElevated,
          '--terminal-fg': DARK_TERMINAL_BASE.fg,
          '--terminal-cursor-accent': DARK_TERMINAL_BASE.bg,
          '--terminal-black': DARK_TERMINAL_BASE.black,
          '--terminal-red': DARK_TERMINAL_BASE.red,
          '--terminal-green': DARK_TERMINAL_BASE.green,
          '--terminal-yellow': DARK_TERMINAL_BASE.yellow,
          '--terminal-blue': DARK_TERMINAL_BASE.blue,
          '--terminal-magenta': DARK_TERMINAL_BASE.magenta,
          '--terminal-cyan': DARK_TERMINAL_BASE.cyan,
          '--terminal-white': DARK_TERMINAL_BASE.white,
          '--terminal-bright-black': DARK_TERMINAL_BASE.brightBlack,
          '--terminal-bright-red': DARK_TERMINAL_BASE.brightRed,
          '--terminal-bright-green': DARK_TERMINAL_BASE.brightGreen,
          '--terminal-bright-yellow': DARK_TERMINAL_BASE.brightYellow,
          '--terminal-bright-blue': DARK_TERMINAL_BASE.brightBlue,
          '--terminal-bright-magenta': DARK_TERMINAL_BASE.brightMagenta,
          '--terminal-bright-cyan': DARK_TERMINAL_BASE.brightCyan,
          '--terminal-bright-white': DARK_TERMINAL_BASE.brightWhite,
          '--terminal-grid-color': rgba(DARK_TERMINAL_BASE.fg, 0.1),
        }),
    // Cursor + selection always use the theme's accent so the terminal feels connected
    '--terminal-cursor': colors.accent,
    '--terminal-selection-bg': rgba(colors.accent, 0.3),
    '--terminal-selection-fg': isDark ? colors.textPrimary : DARK_TERMINAL_BASE.fg,
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
