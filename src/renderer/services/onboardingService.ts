export interface OnboardingProgressEvent {
  taskId: string;
  message: string;
}

export interface OnboardingThinkingEvent {
  taskId: string;
  text: string;
}

export interface OnboardingCompleteEvent {
  taskId: string;
  content: string;
}

export interface OnboardingErrorEvent {
  taskId: string;
  error: string;
}

export function hasOnboardingApi(): boolean {
  return typeof window !== 'undefined' && Boolean(window.api?.onboarding);
}

export function getOnboardingContextDirectories(
  projectId: string
): Promise<Record<string, string[]> | null> {
  return window.api.onboarding.getContextDirectories(projectId);
}

export function generateOnboardingContext(
  taskId: string,
  projectId: string,
  description: string,
  repoDirectories: Record<string, string[]>
): Promise<{ taskId: string }> {
  return window.api.onboarding.generate(taskId, projectId, description, repoDirectories);
}

export function saveOnboardingContext(
  projectId: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  return window.api.onboarding.saveContext(projectId, content);
}

export function saveOnboardingContextDirectories(
  projectId: string,
  repoDirectories: Record<string, string[]>,
): Promise<{ success: boolean; error?: string }> {
  return window.api.onboarding.saveContextDirectories(projectId, repoDirectories);
}

export function subscribeToOnboardingEvents(handlers: {
  onProgress?: (event: OnboardingProgressEvent) => void;
  onThinking?: (event: OnboardingThinkingEvent) => void;
  onComplete?: (event: OnboardingCompleteEvent) => void;
  onError?: (event: OnboardingErrorEvent) => void;
}): () => void {
  const cleanups = [
    handlers.onProgress ? window.api.onboarding.onProgress(handlers.onProgress) : null,
    handlers.onThinking ? window.api.onboarding.onThinking(handlers.onThinking) : null,
    handlers.onComplete ? window.api.onboarding.onComplete(handlers.onComplete) : null,
    handlers.onError ? window.api.onboarding.onError(handlers.onError) : null,
  ].filter((cleanup): cleanup is (() => void) => Boolean(cleanup));

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}
