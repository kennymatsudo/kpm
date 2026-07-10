import type { SettingDefinition } from '../../shared/settingsRegistry';

export function getAppSetting(key: string) {
  return window.api.settings.app.get({ key });
}

export function setAppSetting(key: string, value: string) {
  return window.api.settings.app.set({ key, value });
}

/**
 * Read a setting as its typed value. Folds the default when unset, unreadable,
 * or invalid — callers never see a raw string or restate the default.
 */
export async function getSetting<T>(def: SettingDefinition<T>): Promise<T> {
  try {
    const result = await getAppSetting(def.key);
    return def.decode(result.success ? result.value : null);
  } catch {
    return def.decode(null);
  }
}

export function setSetting<T>(def: SettingDefinition<T>, value: T) {
  return setAppSetting(def.key, def.encode(value));
}

export function hasAnthropicApiKey() {
  return window.api.settings.anthropic.hasKey();
}

export function testAnthropicApiKey(apiKey: string) {
  return window.api.settings.anthropic.testKey({ apiKey });
}

export function saveAnthropicApiKey(apiKey: string) {
  return window.api.settings.anthropic.saveKey({ apiKey });
}

export function deleteAnthropicApiKey() {
  return window.api.settings.anthropic.deleteKey();
}

export function getClaudeAvailability() {
  return window.api.settings.claude.getAvailability();
}

export function refreshClaudeAvailability() {
  return window.api.settings.claude.refreshAvailability();
}

export function getCodexStatus() {
  return window.api.settings.codex.getStatus();
}

export function getProviderReadiness() {
  return window.api.settings.providers.getReadiness();
}

export function refreshProviderReadiness() {
  return window.api.settings.providers.refreshReadiness();
}
