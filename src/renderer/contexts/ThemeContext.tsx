import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';
import type { CustomTheme } from '../../shared/types';
import { type ThemeColors, withDerivedExtendedTokens } from '../../shared/theme';
import {
  type ThemeId,
  type CustomThemePreference,
  type ThemeOption,
  THEMES,
  CUSTOM_THEME_CLASS,
  applyThemeToDocument,
  customThemePreferenceId,
  getCustomThemeId,
  getThemeById,
  isCustomThemeOption,
} from '../themes';
import {
  deleteCustomTheme as deleteCustomThemeById,
  importCustomThemeFromUrl,
  listCustomThemes,
} from '../services/customThemeService';
import { THEME_PREFERENCE_STORAGE_KEY as STORAGE_KEY, writeCustomThemeColorsCache } from '../themeBoot';
import { reportResolvedThemeAppearance } from '../services/themeService';

/** User preference, including the system and custom theme options. */
export type ThemePreference = ThemeId | CustomThemePreference;

/** The actual theme being applied (excludes 'system' which resolves at runtime). */
export type ResolvedTheme = Exclude<ThemeId, 'system'> | CustomThemePreference;

interface ThemeContextValue {
  /** User's theme preference (includes 'system' option) */
  preference: ThemePreference;
  /** The actual theme being applied (always concrete, never 'system') */
  resolved: ResolvedTheme;
  /** Full definition for the applied theme */
  resolvedTheme: ThemeOption;
  /** Built-in and custom themes available to choose from */
  themes: ThemeOption[];
  /** Persisted custom themes */
  customThemes: CustomTheme[];
  /** Whether custom themes are still loading from the main process */
  isLoadingCustomThemes: boolean;
  /** Update the theme preference */
  setPreference: (theme: ThemePreference) => void;
  /** Refresh custom themes from the main process */
  refreshCustomThemes: () => Promise<void>;
  /** Import a custom theme from a vscodethemes.com URL and apply it */
  importThemeFromUrl: (url: string) => Promise<{ success: boolean; theme?: CustomTheme; warnings?: string[]; error?: string }>;
  /** Delete a persisted custom theme */
  deleteTheme: (themeId: string) => Promise<{ success: boolean; error?: string }>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Map an OS color scheme to its concrete default theme. */
function systemSchemeToThemeId(scheme: 'light' | 'dark'): Exclude<ThemeId, 'system'> {
  return scheme === 'dark' ? 'graphite' : 'fog';
}

function isStaticThemeId(value: string): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

function isThemePreference(value: string): value is ThemePreference {
  return isStaticThemeId(value) || getCustomThemeId(value) !== null;
}

function toCustomThemeOption(theme: CustomTheme): ThemeOption {
  return {
    ...theme,
    id: customThemePreferenceId(theme.id),
    customThemeId: theme.id,
    isCustom: true,
  };
}

function isPreferenceAvailable(preference: ThemePreference, customThemes: CustomTheme[]): boolean {
  const customThemeId = getCustomThemeId(preference);
  if (customThemeId) {
    return customThemes.some((theme) => theme.id === customThemeId);
  }
  return isStaticThemeId(preference);
}

function resolveTheme(
  preference: ThemePreference,
  customThemes: CustomTheme[],
  systemTheme: 'light' | 'dark',
): ResolvedTheme {
  if (preference === 'system') {
    return systemSchemeToThemeId(systemTheme);
  }

  const customThemeId = getCustomThemeId(preference);
  if (customThemeId && !customThemes.some((theme) => theme.id === customThemeId)) {
    return systemSchemeToThemeId(systemTheme);
  }

  return preference;
}

function getResolvedThemeOption(resolved: ResolvedTheme, customThemes: CustomTheme[]): ThemeOption {
  const customThemeId = getCustomThemeId(resolved);
  if (customThemeId) {
    const customTheme = customThemes.find((theme) => theme.id === customThemeId);
    if (customTheme) {
      return toCustomThemeOption(customTheme);
    }
  }

  return getThemeById(resolved as Exclude<ThemeId, 'system'>) ?? getThemeById('graphite')!;
}

function applyTheme(theme: ThemeOption): ThemeColors {
  if (isCustomThemeOption(theme)) {
    // Custom themes may predate the 22-token expansion; fill in any missing
    // extended tokens so the renderer always sees a complete ThemeColors.
    const colors = withDerivedExtendedTokens(theme.colors);
    applyThemeToDocument(colors, CUSTOM_THEME_CLASS);
    return colors;
  }

  applyThemeToDocument(theme.colors, theme.id !== 'system' ? theme.id : null);
  return theme.colors;
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);
  const [isLoadingCustomThemes, setIsLoadingCustomThemes] = useState(true);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => getSystemTheme());
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    if (typeof window === 'undefined') return 'system';
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved && isThemePreference(saved) ? saved : 'system';
  });

  const resolved = useMemo(
    () => resolveTheme(preference, customThemes, systemTheme),
    [preference, customThemes, systemTheme],
  );
  const resolvedTheme = useMemo(() => getResolvedThemeOption(resolved, customThemes), [resolved, customThemes]);
  const themes = useMemo<ThemeOption[]>(() => [
    ...THEMES,
    ...customThemes.map(toCustomThemeOption),
  ], [customThemes]);

  const refreshCustomThemes = useCallback(async () => {
    setIsLoadingCustomThemes(true);
    try {
      const result = await listCustomThemes();
      if (result.success) {
        setCustomThemes(result.themes ?? []);
      } else {
        console.error('[ThemeProvider] Failed to load custom themes:', result.error);
      }
    } finally {
      setIsLoadingCustomThemes(false);
    }
  }, []);

  useEffect(() => {
    void refreshCustomThemes();
  }, [refreshCustomThemes]);

  useEffect(() => {
    if (!isLoadingCustomThemes && !isPreferenceAvailable(preference, customThemes)) {
      setPreferenceState('system');
      localStorage.setItem(STORAGE_KEY, 'system');
    }
  }, [customThemes, isLoadingCustomThemes, preference]);

  useEffect(() => {
    const applied = applyTheme(resolvedTheme);
    // Cache custom-theme colors for the synchronous boot module, and report the
    // resolved window background to the main process for the next launch.
    if (isCustomThemeOption(resolvedTheme)) {
      writeCustomThemeColorsCache(resolvedTheme.id, applied);
    }
    void reportResolvedThemeAppearance({ surface0: applied.surface0, colorScheme: applied.colorScheme });
  }, [resolvedTheme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const setPreference = useCallback((newPreference: ThemePreference) => {
    setPreferenceState(newPreference);
    localStorage.setItem(STORAGE_KEY, newPreference);
  }, []);

  const importThemeFromUrl = useCallback(async (url: string) => {
    const result = await importCustomThemeFromUrl(url);
    if (result.success && result.theme) {
      setCustomThemes((current) => [
        result.theme,
        ...current.filter((theme) => theme.id !== result.theme.id),
      ]);
      const nextPreference = customThemePreferenceId(result.theme.id);
      setPreferenceState(nextPreference);
      localStorage.setItem(STORAGE_KEY, nextPreference);
    }
    return result;
  }, []);

  const deleteTheme = useCallback(async (themeId: string) => {
    const result = await deleteCustomThemeById(themeId);
    if (result.success) {
      setCustomThemes((current) => current.filter((theme) => theme.id !== themeId));
      if (preference === customThemePreferenceId(themeId)) {
        setPreferenceState('system');
        localStorage.setItem(STORAGE_KEY, 'system');
      }
    }
    return result;
  }, [preference]);

  const contextValue = useMemo(() => ({
    preference,
    resolved,
    resolvedTheme,
    themes,
    customThemes,
    isLoadingCustomThemes,
    setPreference,
    refreshCustomThemes,
    importThemeFromUrl,
    deleteTheme,
  }), [
    preference,
    resolved,
    resolvedTheme,
    themes,
    customThemes,
    isLoadingCustomThemes,
    setPreference,
    refreshCustomThemes,
    importThemeFromUrl,
    deleteTheme,
  ]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
