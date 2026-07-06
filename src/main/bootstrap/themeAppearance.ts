import { app, nativeTheme } from 'electron';
import fs from 'fs';
import path from 'path';
import { getConfig } from '../config';
import { fogColors, graphiteColors, type ColorScheme } from '../../shared/theme';

export interface ThemeAppearance {
  surface0: string;
  colorScheme: ColorScheme;
}

function appearanceFilePath(): string {
  return path.join(app.getPath('userData'), getConfig().theme.appearanceFilename);
}

/** Read the last theme appearance the renderer reported, or null if absent/corrupt. */
export function readThemeAppearance(): ThemeAppearance | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(appearanceFilePath(), 'utf8')) as Partial<ThemeAppearance>;
    if (typeof parsed.surface0 === 'string' && (parsed.colorScheme === 'dark' || parsed.colorScheme === 'light')) {
      return { surface0: parsed.surface0, colorScheme: parsed.colorScheme };
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist the renderer's resolved appearance for the next launch's window background. */
export function writeThemeAppearance(appearance: ThemeAppearance): void {
  try {
    fs.writeFileSync(appearanceFilePath(), JSON.stringify(appearance), 'utf8');
  } catch (err) {
    console.warn('[themeAppearance] Failed to persist theme appearance:', err);
  }
}

/**
 * The `backgroundColor` to hand `BrowserWindow` at creation so the first paint
 * matches the theme. Uses the reported sidecar; on first-ever launch there is
 * none, so fall back to the OS appearance and the shared built-in surfaces.
 */
export function resolveStartupBackgroundColor(): string {
  const appearance = readThemeAppearance();
  if (appearance) {
    return appearance.surface0;
  }
  return nativeTheme.shouldUseDarkColors ? graphiteColors.surface0 : fogColors.surface0;
}
