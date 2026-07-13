/**
 * Typed synchronous access to the `app_settings` store for the main process.
 * Reads and writes a setting through its registry codec, so main-process
 * callers work with typed values instead of raw string keys.
 */

import {
  getSettingDefinition,
  type SettingName,
  type SettingValue,
} from '../../shared/settingsRegistry';
import type { IAppSettingsRepository } from './interfaces';

export function getSetting<K extends SettingName>(
  appSettings: IAppSettingsRepository,
  name: K
): SettingValue<K> {
  const def = getSettingDefinition(name);
  return def.decode(appSettings.get(def.key));
}

export function getOptionalSetting<K extends SettingName>(
  appSettings: IAppSettingsRepository,
  name: K
): SettingValue<K> | undefined {
  const def = getSettingDefinition(name);
  const raw = appSettings.get(def.key);
  return raw === undefined ? undefined : def.decode(raw);
}

export function setSetting<K extends SettingName>(
  appSettings: IAppSettingsRepository,
  name: K,
  value: SettingValue<K>
): void {
  const def = getSettingDefinition(name);
  appSettings.set(def.key, def.encode(value));
}
