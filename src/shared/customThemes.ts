import type { ColorScheme, PartialThemeColors } from './theme';

export type CustomThemeSourceType = 'vscodethemes';

export type CustomThemeColorScheme = ColorScheme;

/**
 * A custom (user-imported) theme's colors are structurally the relaxed
 * `PartialThemeColors`: the 7 extended tokens are optional so legacy persisted
 * themes still load, and defaults are derived at apply time from
 * accent/surfaces via `withDerivedExtendedTokens`.
 */
export type CustomThemeColors = PartialThemeColors;

export interface CustomThemeSource {
  type: CustomThemeSourceType;
  url: string;
  extensionId: string;
  publisher: string;
  extensionName: string;
  themeSlug: string;
  themeLabel: string;
  importedAt: string;
}

export interface CustomThemeTokenRule {
  token: string;
  foreground?: string;
  background?: string;
  fontStyle?: string;
}

export interface CustomThemeVsCodeData {
  base: 'vs' | 'vs-dark';
  inherit: boolean;
  colors: Record<string, string>;
  rules: CustomThemeTokenRule[];
  encodedTokensColors?: string[];
  semanticHighlighting?: boolean;
  semanticTokenColors?: Record<string, unknown>;
}

export interface CustomTheme {
  id: string;
  sourceKey: string;
  name: string;
  description: string;
  colors: CustomThemeColors;
  preview: {
    surface: string;
    accent: string;
    text: string;
  };
  vscode: CustomThemeVsCodeData;
  source: CustomThemeSource;
  created_at: string;
  updated_at: string;
}

export interface ImportedCustomThemeResult {
  theme: CustomTheme;
  warnings: string[];
}

