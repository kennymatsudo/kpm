export type CustomThemeSourceType = 'vscodethemes';

export type CustomThemeColorScheme = 'light' | 'dark';

export interface CustomThemeColors {
  colorScheme: CustomThemeColorScheme;
  surface0: string;
  surface1: string;
  surface2: string;
  surface3: string;
  surface4: string;
  surfaceElevated: string;
  // Extended (22-token) fields — optional on custom themes so legacy persisted
  // themes still load. Defaults are derived at apply time from accent/surfaces.
  surfaceCode?: string;
  surfaceSelected?: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textMuted: string;
  textOnAccent?: string;
  accent: string;
  accentHover: string;
  accentActive?: string;
  focusRing?: string;
  link?: string;
  linkVisited?: string;
  success?: string;
  warning?: string;
  danger?: string;
  info?: string;
  purple?: string;
  depth0?: string;
  depth1?: string;
  depth2?: string;
  depth3?: string;
  depth4?: string;
}

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

