import {
  getSettingDefinition,
  type SettingName,
  type SettingValue,
} from '../../shared/settingsRegistry';
import { resolveDefaultModel, type DefaultModel } from '../../shared/modelDefault';

function getAppSetting(key: string) {
  return window.api.settings.app.get({ key });
}

function setAppSetting(key: string, value: string) {
  return window.api.settings.app.set({ key, value });
}

/**
 * Read a setting as its typed value. Folds the default when unset, unreadable,
 * or invalid — callers never see a raw string or restate the default.
 */
export async function getSetting<K extends SettingName>(name: K): Promise<SettingValue<K>> {
  const def = getSettingDefinition(name);
  try {
    const result = await getAppSetting(def.key);
    return def.decode(result.success ? result.value : null);
  } catch {
    return def.decode(null);
  }
}

export async function getOptionalSetting<K extends SettingName>(
  name: K
): Promise<SettingValue<K> | undefined> {
  const def = getSettingDefinition(name);
  try {
    const result = await getAppSetting(def.key);
    return result.success && result.value != null ? def.decode(result.value) : undefined;
  } catch {
    return undefined;
  }
}

export function setSetting<K extends SettingName>(name: K, value: SettingValue<K>) {
  const def = getSettingDefinition(name);
  return setAppSetting(def.key, def.encode(value));
}

/** The user's current KPM model choice, for playbook `useDefault` candidates. */
export async function getDefaultModel(): Promise<DefaultModel> {
  const [provider, claudeModel, codexModel, piProviderModel] = await Promise.all([
    getSetting('chatProvider'),
    getSetting('chatModel'),
    getSetting('chatCodexModel'),
    getSetting('chatPiProviderModel'),
  ]);
  return resolveDefaultModel({ provider, claudeModel, codexModel, piProviderModel });
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
