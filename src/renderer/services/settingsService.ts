export function getAppSetting(key: string) {
  return window.api.settings.app.get(key);
}

export function setAppSetting(key: string, value: string) {
  return window.api.settings.app.set(key, value);
}

export function hasAnthropicApiKey() {
  return window.api.settings.anthropic.hasKey();
}

export function testAnthropicApiKey(apiKey: string) {
  return window.api.settings.anthropic.testKey(apiKey);
}

export function saveAnthropicApiKey(apiKey: string) {
  return window.api.settings.anthropic.saveKey(apiKey);
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
