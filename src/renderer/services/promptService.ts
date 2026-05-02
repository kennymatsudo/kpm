
export function listCustomPrompts() {
  return window.api.customPrompts.list();
}

export function createCustomPrompt(
  name: string,
  promptContent: string,
  options?: {
    description?: string | null;
    icon?: CustomPromptIcon;
    keywords?: string | null;
  }
) {
  return window.api.customPrompts.create(name, promptContent, options);
}

export function updateCustomPrompt(
  promptId: string,
  updates: {
    name?: string;
    description?: string | null;
    promptContent?: string;
    icon?: CustomPromptIcon;
    keywords?: string | null;
  }
) {
  return window.api.customPrompts.update(promptId, updates);
}

export function deleteCustomPrompt(promptId: string) {
  return window.api.customPrompts.delete(promptId);
}

export function ensureBuiltinCustomPrompts() {
  return window.api.customPrompts.ensureBuiltins();
}

export function executeCustomPrompt(projectId: string, promptId: string) {
  return window.api.customPrompts.execute(projectId, promptId);
}

export function subscribeToCustomPromptComplete(
  callback: (data: { taskId: string; filePath: string; promptName: string }) => void,
): () => void {
  return window.api.customPrompts.onComplete(callback);
}

export function subscribeToCustomPromptError(
  callback: (data: { taskId: string; error: string }) => void,
): () => void {
  return window.api.customPrompts.onError(callback);
}

export function listPromptOverrides() {
  return window.api.promptOverrides.list();
}

export function getPromptOverride(key: string) {
  return window.api.promptOverrides.get(key);
}

export function savePromptOverride(key: string, content: string) {
  return window.api.promptOverrides.set(key, content);
}

export function resetPromptOverride(key: string) {
  return window.api.promptOverrides.reset(key);
}
