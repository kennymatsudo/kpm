export function listPromptOverrides() {
  return window.api.promptOverrides.list({});
}

export function getPromptOverride(key: string) {
  return window.api.promptOverrides.get({ key });
}

export function savePromptOverride(key: string, content: string) {
  return window.api.promptOverrides.set({ key, content });
}

export function resetPromptOverride(key: string) {
  return window.api.promptOverrides.reset({ key });
}
