/**
 * Typed synchronous access to the `app_settings` store for the main process.
 * Reads and writes a setting through its registry codec, so main-process
 * callers work with typed values instead of raw string keys.
 */

import type { SettingDefinition } from '../../shared/settingsRegistry';
import type { IAppSettingsRepository } from './interfaces';

export function getSetting<T>(appSettings: IAppSettingsRepository, def: SettingDefinition<T>): T {
  return def.decode(appSettings.get(def.key));
}

export function setSetting<T>(
  appSettings: IAppSettingsRepository,
  def: SettingDefinition<T>,
  value: T
): void {
  appSettings.set(def.key, def.encode(value));
}
