import { fogColors, graphiteColors, type ThemeColors } from '../shared/theme';
import { CUSTOM_THEME_CLASS, applyThemeToDocument, getCustomThemeId } from './themes';

export const THEME_PREFERENCE_STORAGE_KEY = 'kpm-theme-preference';
/**
 * Last-resolved colors of the applied custom theme, cached so the synchronous
 * boot below can paint a custom theme before the async custom-theme IPC load
 * completes. Built-in themes never need this — they resolve from the manifest.
 */
export const THEME_COLORS_CACHE_KEY = 'kpm-theme-colors-cache';

interface CachedCustomTheme {
  preference: string;
  colors: ThemeColors;
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStoredPreference(): string | null {
  try {
    return localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readCachedCustomColors(preference: string): ThemeColors | null {
  try {
    const raw = localStorage.getItem(THEME_COLORS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedCustomTheme>;
    if (parsed.preference === preference && parsed.colors && typeof parsed.colors.surface0 === 'string') {
      return parsed.colors;
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist the applied custom theme's colors for the next cold start's boot. */
export function writeCustomThemeColorsCache(preference: string, colors: ThemeColors): void {
  try {
    localStorage.setItem(THEME_COLORS_CACHE_KEY, JSON.stringify({ preference, colors } satisfies CachedCustomTheme));
  } catch {
    // localStorage may be full or unavailable; the boot fallback covers this.
  }
}

function applySystemTheme(): void {
  const dark = prefersDark();
  applyThemeToDocument(dark ? graphiteColors : fogColors, dark ? 'graphite' : 'fog');
}

/**
 * Resolve and apply the persisted theme to the document synchronously, before
 * React mounts, so the first paint already carries the right colors instead of
 * flashing an unstyled default. Runs from the renderer entry point.
 */
export function bootTheme(): void {
  const preference = readStoredPreference();

  if (preference === 'graphite') {
    applyThemeToDocument(graphiteColors, 'graphite');
    return;
  }
  if (preference === 'fog') {
    applyThemeToDocument(fogColors, 'fog');
    return;
  }

  if (preference && getCustomThemeId(preference) !== null) {
    const cached = readCachedCustomColors(preference);
    if (cached) {
      applyThemeToDocument(cached, CUSTOM_THEME_CLASS);
      return;
    }
    // Cache miss (e.g. localStorage cleared): fall back to a built-in this launch.
    applySystemTheme();
    return;
  }

  // 'system', unset, or an unrecognized value.
  applySystemTheme();
}
