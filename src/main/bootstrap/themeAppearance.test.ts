import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { graphiteColors } from '../../shared/theme';
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

  it('falls back to the OS-appearance built-in surface when no sidecar exists', () => {
    // The test electron mock reports shouldUseDarkColors: true.
    expect(resolveStartupBackgroundColor()).toBe(graphiteColors.surface0);
  });
});
