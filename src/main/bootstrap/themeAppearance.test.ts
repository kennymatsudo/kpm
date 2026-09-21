import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { app, nativeTheme } from 'electron';
import { fogColors, graphiteColors } from '../../shared/theme';
import { getConfig } from '../config';
import {
  readThemeAppearance,
  resolveStartupBackgroundColor,
  writeThemeAppearance,
} from './themeAppearance';

function sidecarPath(): string {
  return path.join(app.getPath('userData'), getConfig().theme.appearanceFilename);
}

describe('themeAppearance sidecar', () => {
  beforeEach(() => {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.rmSync(sidecarPath(), { force: true });
  });

  afterEach(() => {
    fs.rmSync(sidecarPath(), { force: true });
  });

  it('round-trips a written appearance', () => {
    writeThemeAppearance({ surface0: '#123456', colorScheme: 'light' });
    expect(readThemeAppearance()).toEqual({ surface0: '#123456', colorScheme: 'light' });
  });

  it('returns null when the sidecar is absent', () => {
    expect(readThemeAppearance()).toBeNull();
  });

  it('returns null when the sidecar is corrupt', () => {
    fs.writeFileSync(sidecarPath(), 'not json', 'utf8');
    expect(readThemeAppearance()).toBeNull();
  });

  it('returns null when the sidecar has an invalid color scheme', () => {
    fs.writeFileSync(sidecarPath(), JSON.stringify({ surface0: '#000', colorScheme: 'sepia' }), 'utf8');
    expect(readThemeAppearance()).toBeNull();
  });

  it('resolves the startup background from the sidecar when present', () => {
    writeThemeAppearance({ surface0: '#abcdef', colorScheme: 'dark' });
    expect(resolveStartupBackgroundColor()).toBe('#abcdef');
  });

  it('falls back to the dark built-in surface when the OS reports dark mode and no sidecar exists', () => {
    const mockNativeTheme = nativeTheme as { shouldUseDarkColors: boolean };
    const original = mockNativeTheme.shouldUseDarkColors;
    mockNativeTheme.shouldUseDarkColors = true;
    try {
      expect(resolveStartupBackgroundColor()).toBe(graphiteColors.surface0);
    } finally {
      mockNativeTheme.shouldUseDarkColors = original;
    }
  });

  it('falls back to the light built-in surface when the OS reports light mode and no sidecar exists', () => {
    const mockNativeTheme = nativeTheme as { shouldUseDarkColors: boolean };
    const original = mockNativeTheme.shouldUseDarkColors;
    mockNativeTheme.shouldUseDarkColors = false;
    try {
      expect(resolveStartupBackgroundColor()).toBe(fogColors.surface0);
    } finally {
      mockNativeTheme.shouldUseDarkColors = original;
    }
  });
});
