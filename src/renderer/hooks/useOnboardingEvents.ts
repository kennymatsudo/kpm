import { useState, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useBackgroundTaskStore } from '../stores/backgroundTaskStore';
import { startOnboardingTask } from '../services/onboardingTaskBridge';

interface StartGenerationOpts {
  projectId: string;
  projectName: string;
  description: string;
  repoDirectories: Record<string, string[]>;
  flow: 'create' | 'regen';
}

interface UseOnboardingEventsResult {
  taskId: string | null;
  messages: string[];
  generatedContent: string | null;
  error: string | null;
  isGenerating: boolean;
  startGeneration: (opts: StartGenerationOpts) => Promise<string>;
  setActiveTaskId: (id: string | null) => void;
  reset: () => void;
}

/**
 * Reads onboarding task state from the generic background task store. Exposes
 * the in-flight taskId so callers (the wizard) can pass it back as a resume
 * handle. State survives unmount because it lives in the store, not the hook.
 */
export function useOnboardingEvents(initialTaskId: string | null = null): UseOnboardingEventsResult {
  const [taskId, setTaskId] = useState<string | null>(initialTaskId);

  const task = useBackgroundTaskStore(
    useShallow((state) => (taskId ? state.tasks[taskId] : undefined)),
  );

  const startGeneration = useCallback(
    async (opts: StartGenerationOpts) => {
      const id = await startOnboardingTask(opts);
      setTaskId(id);
      return id;
    },
    [],
  );

  const reset = useCallback(() => {
    setTaskId(null);
  }, []);

  return {
    taskId,
    messages: task?.messages ?? [],
    generatedContent: task?.result ?? null,
    error: task?.error ?? null,
    isGenerating: task?.status === 'running',
    startGeneration,
    setActiveTaskId: setTaskId,
    reset,
  };
}
