import type { CustomTheme, CustomThemeVsCodeData } from '../../shared/types';

export type ThemeId =
  | 'system'
  | 'graphite'
  | 'fog';
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
  surfaceCode: string; // Code blocks, terminals, <pre>
  surfaceSelected: string; // Selected list/tree/menu items (rgba string allowed)

  // Text colors
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textMuted: string;
  textOnAccent: string; // Foreground on top of `accent` fills

  // Accent color (primary brand color)
  accent: string;
  accentHover: string;
  accentActive: string; // Pressed state for accent fills
  focusRing: string; // Focus ring color (rgba string)

  // Link colors (markdown / prose)
  link: string;
  linkVisited: string;

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

export type CustomThemePreference = `custom:${string}`;

export interface CustomThemeOption extends Omit<CustomTheme, 'id'> {
  id: CustomThemePreference;
  customThemeId: string;
  isCustom: true;
}

export type ThemeOption = ThemeDefinition | CustomThemeOption;

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

/** Darken a hex color by mixing with black. factor 0 = original, 1 = black */
function darken(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(hex);
  const d = (v: number) => Math.round(v * (1 - factor));
  return `#${[d(r), d(g), d(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Compute relative luminance per WCAG; used to pick black/white as on-accent text. */
function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * A relaxed version of ThemeColors where the 7 new extended tokens are optional.
 * Used to accept custom (user-imported) themes that predate the extension.
 */
export type PartialThemeColors = Omit<
  ThemeColors,
  | 'surfaceCode'
  | 'surfaceSelected'
  | 'textOnAccent'
  | 'accentActive'
  | 'focusRing'
  | 'link'
  | 'linkVisited'
> & {
  surfaceCode?: string;
  surfaceSelected?: string;
  textOnAccent?: string;
  accentActive?: string;
  focusRing?: string;
  link?: string;
  linkVisited?: string;
};

/**
 * Fill in any missing extended-token fields on a partial color set with
 * sensible derivations. Built-in themes always declare the full 22 tokens —
 * this exists so user-imported (custom) themes don't need to be re-imported
 * after the token-system expansion.
 */
export function withDerivedExtendedTokens(colors: PartialThemeColors): ThemeColors {
  const isDark = colors.colorScheme === 'dark';
  const accentLuminance = relativeLuminance(colors.accent);
  // Pick whichever of black/white has more contrast against the accent fill.
  const onAccentDefault = accentLuminance > 0.45
    ? '#0e0f12'
    : '#ffffff';

  return {
    ...colors,
    surfaceCode: colors.surfaceCode ?? (isDark ? darken(colors.surface1, 0.3) : colors.surface3),
    surfaceSelected: colors.surfaceSelected ?? rgba(colors.accent, isDark ? 0.12 : 0.10),
    textOnAccent: colors.textOnAccent ?? onAccentDefault,
    accentActive: colors.accentActive ?? darken(colors.accent, 0.12),
    focusRing: colors.focusRing ?? rgba(colors.accent, isDark ? 0.45 : 0.35),
    link: colors.link ?? colors.accent,
    linkVisited: colors.linkVisited ?? (isDark ? '#c69cff' : '#7a4fa0'),
  };
}

// ============================================
// Theme Definitions
// ============================================

// Graphite — cool neutral charcoal, electric blue accent
const graphiteColors: ThemeColors = {
  colorScheme: 'dark',
  surface0: '#0e0f12',
  surface1: '#15171b',
  surface2: '#1c1e23',
  surface3: '#272a31',
  surface4: '#363a44',
  surfaceElevated: '#1f2229',
  surfaceCode: '#0a0b0d',
  surfaceSelected: 'rgba(110, 168, 254, 0.14)',
  textPrimary: '#e8eaef',
  textSecondary: '#a8adb8',
  textTertiary: '#7a8090',
  textMuted: '#4f5563',
  textOnAccent: '#0e0f12',
  accent: '#6ea8fe',
  accentHover: '#8bbcff',
  accentActive: '#5a92e8',
  focusRing: 'rgba(110, 168, 254, 0.45)',
  link: '#8bbcff',
  linkVisited: '#c69cff',
  success: '#7ec27a',
  warning: '#e0b870',
  danger: '#e78a8a',
  info: '#6ea8fe',
};

// Fog — cool neutral gray, indigo accent
const fogColors: ThemeColors = {
  colorScheme: 'light',
  surface0: '#f4f5f7',
  surface1: '#ffffff',
  surface2: '#eef0f3',
  surface3: '#e2e5ea',
  surface4: '#cdd2da',
  surfaceElevated: '#ffffff',
  surfaceCode: '#eef0f3',
  surfaceSelected: 'rgba(79, 86, 230, 0.10)',
  textPrimary: '#16181c',
  textSecondary: '#4a4f57',
  textTertiary: '#717680',
  textMuted: '#a0a4ad',
  textOnAccent: '#ffffff',
  accent: '#4f56e6',
  accentHover: '#6970f0',
  accentActive: '#3d44c8',
  focusRing: 'rgba(79, 86, 230, 0.35)',
  link: '#4f56e6',
  linkVisited: '#7a4fa0',
  success: '#1f8a4c',
  warning: '#c87514',
  danger: '#d04444',
  info: '#1976d2',
};

export const THEMES: ThemeDefinition[] = [
  {
    id: 'system',
    name: 'System',
    description: 'Follow OS preference',
    colors: graphiteColors, // Used for preview only — matches the new dark default
    preview: { surface: '#0e0f12', accent: '#6ea8fe', text: '#e8eaef' },
  },
  {
    id: 'fog',
    name: 'Fog',
    description: 'Cool neutral gray',
    colors: fogColors,
    preview: { surface: '#f4f5f7', accent: '#4f56e6', text: '#16181c' },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: 'Cool neutral charcoal',
    colors: graphiteColors,
    preview: { surface: '#0e0f12', accent: '#6ea8fe', text: '#e8eaef' },
  },
];

export function getThemeById(id: ThemeId): ThemeDefinition | undefined {
  return THEMES.find((t) => t.id === id);
}

export function customThemePreferenceId(themeId: string): CustomThemePreference {
  return `custom:${themeId}`;
}

export function getCustomThemeId(preference: string): string | null {
  return preference.startsWith('custom:') ? preference.slice('custom:'.length) : null;
}

export function isCustomThemeOption(theme: ThemeOption): theme is CustomThemeOption {
  return 'isCustom' in theme && theme.isCustom === true;
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
    '--color-surface-code': colors.surfaceCode,
    '--color-surface-selected': colors.surfaceSelected,

    // Text
    '--color-text-primary': colors.textPrimary,
    '--color-text-secondary': colors.textSecondary,
    '--color-text-tertiary': colors.textTertiary,
    '--color-text-muted': colors.textMuted,
    '--color-text-on-accent': colors.textOnAccent,

    // Borders
    '--color-border-subtle': `rgba(${borderColor}, ${borderSubtleOpacity})`,
    '--color-border-default': `rgba(${borderColor}, ${borderDefaultOpacity})`,
    '--color-border-strong': `rgba(${borderColor}, ${borderStrongOpacity})`,

    // Accent
    '--color-accent': colors.accent,
    '--color-accent-hover': colors.accentHover,
    '--color-accent-active': colors.accentActive,
    '--color-accent-muted': rgba(colors.accent, mutedOpacity),
    '--color-accent-subtle': rgba(colors.accent, subtleOpacity),
    '--color-focus-ring': colors.focusRing,

    // Links
    '--color-link': colors.link,
    '--color-link-visited': colors.linkVisited,

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
    '--color-code-bg': rgba(colors.accent, isDark ? 0.15 : 0.08),

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
 * Apply concrete theme colors to the document root.
 */
export function applyThemeColors(colors: ThemeColors): void {
  const variables = generateThemeVariables(colors);
  const root = document.documentElement;

  for (const [key, value] of Object.entries(variables)) {
    if (key === 'color-scheme') {
      root.style.colorScheme = value;
    } else {
      root.style.setProperty(key, value);
    }
  }
}

/**
 * Apply a built-in theme's CSS variables to the document root.
 */
export function applyThemeVariables(themeId: Exclude<ThemeId, 'system'>): void {
  const theme = getThemeById(themeId);
  if (!theme) return;

  applyThemeColors(theme.colors);
}

export function createMonacoThemeData(theme: ThemeOption): CustomThemeVsCodeData {
  if (isCustomThemeOption(theme)) {
    return theme.vscode;
  }

  const colors = theme.colors;
  const isDark = colors.colorScheme === 'dark';

  // Mirror generateThemeVariables so Monaco widget borders match the rest of the app.
  const borderRgb = isDark ? '255, 255, 255' : '0, 0, 0';
  const borderDefault = `rgba(${borderRgb}, ${isDark ? 0.08 : 0.12})`;
  const widgetShadow = isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.15)';

  const danger = colors.danger ?? (isDark ? '#f87171' : '#dc2626');
  const warning = colors.warning ?? (isDark ? '#fbbf24' : '#ca8a04');
  const info = colors.info ?? (isDark ? '#60a5fa' : '#2563eb');

  return {
    base: isDark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: {
      // Editor body
      'editor.background': colors.surfaceCode,
      'editor.foreground': colors.textPrimary,
      'editorLineNumber.foreground': colors.textMuted,
      'editorLineNumber.activeForeground': colors.textSecondary,
      'editor.lineHighlightBackground': colors.surface2,
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': `${colors.accent}33`,
      'editor.inactiveSelectionBackground': `${colors.accent}1a`,
      'editorCursor.foreground': colors.accentHover,
      'editorWhitespace.foreground': colors.surface4,
      'editorIndentGuide.background1': colors.surface3,
      'editorIndentGuide.activeBackground1': colors.textMuted,
      'editorGutter.background': colors.surface0,
      'editorBracketMatch.background': `${colors.accent}1a`,
      'editorBracketMatch.border': colors.accent,

      // Find widget / hover / suggest widget chrome
      'editorWidget.background': colors.surfaceElevated,
      'editorWidget.foreground': colors.textPrimary,
      'editorWidget.border': borderDefault,
      'editorWidget.resizeBorder': colors.accent,
      'widget.shadow': widgetShadow,
      'editorHoverWidget.background': colors.surfaceElevated,
      'editorHoverWidget.foreground': colors.textPrimary,
      'editorHoverWidget.border': borderDefault,
      'editorSuggestWidget.background': colors.surfaceElevated,
      'editorSuggestWidget.foreground': colors.textPrimary,
      'editorSuggestWidget.border': borderDefault,
      'editorSuggestWidget.selectedBackground': `${colors.accent}33`,
      'editorSuggestWidget.highlightForeground': colors.accent,

      // Input fields (find widget search/replace boxes)
      'input.background': colors.surface1,
      'input.foreground': colors.textPrimary,
      'input.border': borderDefault,
      'input.placeholderForeground': colors.textMuted,
      'inputOption.activeBackground': `${colors.accent}33`,
      'inputOption.activeBorder': colors.accent,
      'inputOption.activeForeground': colors.textPrimary,
      'inputValidation.errorBackground': `${danger}1a`,
      'inputValidation.errorBorder': danger,
      'inputValidation.warningBackground': `${warning}1a`,
      'inputValidation.warningBorder': warning,
      'inputValidation.infoBackground': `${info}1a`,
      'inputValidation.infoBorder': info,

      // Focus ring
      focusBorder: colors.accent,

      // Buttons inside widgets
      'button.background': colors.accent,
      'button.foreground': colors.textOnAccent,
      'button.hoverBackground': colors.accentHover,
      'button.secondaryBackground': colors.surface3,
      'button.secondaryForeground': colors.textPrimary,
      'button.secondaryHoverBackground': colors.surface4,

      // Dropdowns
      'dropdown.background': colors.surfaceElevated,
      'dropdown.foreground': colors.textPrimary,
      'dropdown.border': borderDefault,
      'dropdown.listBackground': colors.surfaceElevated,

      // Lists (suggest widget rows, tree views inside widgets)
      'list.hoverBackground': colors.surface3,
      'list.activeSelectionBackground': `${colors.accent}33`,
      'list.activeSelectionForeground': colors.textPrimary,
      'list.inactiveSelectionBackground': colors.surface3,
      'list.inactiveSelectionForeground': colors.textPrimary,
      'list.focusBackground': `${colors.accent}33`,
      'list.focusForeground': colors.textPrimary,

      // Find matches
      'editor.findMatchBackground': `${colors.accent}66`,
      'editor.findMatchBorder': colors.accent,
      'editor.findMatchHighlightBackground': `${colors.accent}33`,
      'editor.findRangeHighlightBackground': `${colors.accent}1a`,

      // Scrollbars
      'scrollbar.shadow': widgetShadow,
      'scrollbarSlider.background': `${colors.surface4}80`,
      'scrollbarSlider.hoverBackground': `${colors.surface4}b3`,
      'scrollbarSlider.activeBackground': colors.surface4,

      // Diagnostic foregrounds (in case any leak past renderValidationDecorations: 'off')
      'editorError.foreground': danger,
      'editorWarning.foreground': warning,
      'editorInfo.foreground': info,
    },
  };
}
