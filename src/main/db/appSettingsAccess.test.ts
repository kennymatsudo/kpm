import { describe, expect, it } from 'vitest';
import type { IAppSettingsRepository } from './interfaces';
import { getOptionalSetting, getSetting, setSetting } from './appSettingsAccess';

function createMemorySettings(initial: Record<string, string> = {}): IAppSettingsRepository {
  const values = new Map(Object.entries(initial));
  return {
    get: (key) => values.get(key),
    set: (key, value) => values.set(key, value),
    delete: (key) => values.delete(key),
    getAll: () => Object.fromEntries(values),
  };
}

describe('typed app settings access', () => {
  it('persists and reads a fixed preference by registry name', () => {
    const settings = createMemorySettings();

    setSetting(settings, 'connectPromptSeen', true);

    expect(getSetting(settings, 'connectPromptSeen')).toBe(true);
  });

  it('distinguishes a missing preference from its default', () => {
    const settings = createMemorySettings();

    expect(getOptionalSetting(settings, 'chatProvider')).toBeUndefined();
    expect(getSetting(settings, 'chatProvider')).toBe('claude');
  });
});
