import type { CustomTheme, CustomThemeVsCodeData } from '../../shared/types';
import {
  type ThemeColors,
  type PartialThemeColors,
  graphiteColors,
  fogColors,
  generateThemeVariables,
  resolveSemanticColors,
  withDerivedExtendedTokens,
  lighten,
  mix,
} from '../../shared/theme';

export type ThemeId =
  | 'system'
  | 'graphite'
  | 'fog';

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
// Theme Definitions
// ============================================

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
// Applying themes to the document
// ============================================

/** Body classes for the built-in themes, e.g. `graphite` / `fog`. */
export const BUILTIN_THEME_CLASSES = THEMES.filter((theme) => theme.id !== 'system').map((theme) => theme.id);
export const CUSTOM_THEME_CLASS = 'custom-theme';

const ALL_THEME_CLASSES = [...BUILTIN_THEME_CLASSES, CUSTOM_THEME_CLASS];

/** Write a theme's CSS variables (and `color-scheme`) onto the document root. */
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
 * Apply a resolved theme to the document: swap the theme body class and write
 * its CSS variables. `themeClass` is the built-in id, `CUSTOM_THEME_CLASS`, or
 * `null` for no marker class.
 */
export function applyThemeToDocument(colors: ThemeColors, themeClass: string | null): void {
  const root = document.documentElement;
  root.classList.remove(...ALL_THEME_CLASSES);
  if (themeClass) {
    root.classList.add(themeClass);
  }
  applyThemeColors(colors);
}

/**
 * Map theme tokens to mermaid `base`-theme variables so rendered diagrams
 * match the app like Monaco and the terminal do. Diagrams sit on surface1
 * (the chat pane and the expanded-overlay panel), so fills and label masks
 * are blended against it.
 */
export function createMermaidThemeVariables(themeColors: PartialThemeColors): Record<string, string | boolean> {
  const colors = withDerivedExtendedTokens(themeColors);
  const isDark = colors.colorScheme === 'dark';
  const { success, warning, danger, info, purple } = resolveSemanticColors(colors, isDark);

  const surface = colors.surface1;
  const nodeFill = mix(surface, colors.accent, isDark ? 0.16 : 0.1);
  const nodeBorder = mix(surface, colors.accent, isDark ? 0.55 : 0.45);
  const neutralBorder = mix(surface, colors.textPrimary, isDark ? 0.16 : 0.22);

  return {
    darkMode: isDark,
    background: surface,
    fontFamily: 'var(--font-sans)',
    fontSize: '14px',

    // Nodes (flowchart shapes, sequence actors, state/class boxes)
    primaryColor: nodeFill,
    primaryTextColor: colors.textPrimary,
    primaryBorderColor: nodeBorder,
    secondaryColor: colors.surface2,
    secondaryTextColor: colors.textPrimary,
    secondaryBorderColor: neutralBorder,
    tertiaryColor: colors.surface2,
    tertiaryTextColor: colors.textPrimary,
    tertiaryBorderColor: neutralBorder,

    // Edges and labels
    lineColor: colors.textTertiary,
    defaultLinkColor: colors.textTertiary,
    arrowheadColor: colors.textTertiary,
    textColor: colors.textPrimary,
    titleColor: colors.textPrimary,
    nodeTextColor: colors.textPrimary,
    edgeLabelBackground: surface,

    // Subgraphs / clusters
    clusterBkg: mix(surface, colors.textPrimary, 0.04),
    clusterBorder: neutralBorder,

    // Notes (sequence/state)
    noteBkgColor: mix(surface, warning, isDark ? 0.18 : 0.14),
    noteTextColor: colors.textPrimary,
    noteBorderColor: mix(surface, warning, 0.5),

    // Sequence diagrams
    actorLineColor: colors.textMuted,
    activationBkgColor: colors.surface2,
    activationBorderColor: neutralBorder,
    labelBoxBkgColor: nodeFill,
    labelBoxBorderColor: nodeBorder,

    // ER attribute rows (defaults are white regardless of dark mode)
    attributeBackgroundColorOdd: surface,
    attributeBackgroundColorEven: colors.surface2,

    // Gantt
    gridColor: colors.textMuted,
    todayLineColor: danger,

    // Pie slices (defaults derive dull tints from the neutral secondary/tertiary)
    pie1: colors.accent,
    pie2: purple,
    pie3: success,
    pie4: warning,
    pie5: danger,
    pie6: info,
    pieOpacity: '0.85',
    pieTitleTextColor: colors.textPrimary,
    pieSectionTextColor: colors.textPrimary,
    pieLegendTextColor: colors.textPrimary,
    pieStrokeColor: surface,
    pieOuterStrokeColor: neutralBorder,

    // Git graph branches (same neutral-derivation problem as pie)
    git0: colors.accent,
    git1: purple,
    git2: success,
    git3: warning,
    git4: danger,
    git5: info,
    git6: lighten(colors.accent, 0.3),
    git7: lighten(purple, 0.3),
    commitLabelColor: colors.textPrimary,
    commitLabelBackground: colors.surface2,
    tagLabelColor: colors.textPrimary,
    tagLabelBackground: nodeFill,
    tagLabelBorder: nodeBorder,

    // Invalid diagram fragments
    errorBkgColor: mix(surface, danger, 0.18),
    errorTextColor: danger,
  };
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

  const { danger, warning, info } = resolveSemanticColors(colors, isDark);

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
