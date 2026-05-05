/**
 * Onboarding background-task bridge.
 *
 * Translates onboarding IPC events into mutations on the generic
 * `backgroundTaskStore`. Lets the wizard close while generation continues —
 * a topbar badge can resume the user back into the wizard when the task
 * completes (or errors).
 */

import { useBackgroundTaskStore } from '../stores/backgroundTaskStore';
import {
  generateOnboardingContext,
  hasOnboardingApi,
  subscribeToOnboardingEvents,
} from './onboardingService';

export const ONBOARDING_TASK_KIND = 'onboarding';

/**
 * `flow` distinguishes which surface originated the task so the topbar badge
 * can resume the user back into the right modal:
 * - 'create' → ProjectOnboardingWizard (new project creation)
 * - 'regen'  → RegenerateContextModal (re-running against an existing project)
 */
export interface OnboardingTaskMeta {
  projectId: string;
  projectName: string;
  flow: 'create' | 'regen';
}

interface StartOnboardingTaskOpts {
  projectId: string;
  projectName: string;
  description: string;
  repoDirectories: Record<string, string[]>;
  flow: 'create' | 'regen';
}

function newTaskId(): string {
  return `onboarding-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Register a new onboarding task in the store and kick off generation. Returns
 * the taskId immediately so the caller can subscribe to its store entry.
 */
export async function startOnboardingTask(
  opts: StartOnboardingTaskOpts,
): Promise<string> {
  const taskId = newTaskId();
  const meta: OnboardingTaskMeta = {
    projectId: opts.projectId,
    projectName: opts.projectName,
    flow: opts.flow,
  };

  const labelPrefix = opts.flow === 'regen' ? 'Regenerating' : 'Generating';
  useBackgroundTaskStore.getState().start({
    id: taskId,
    kind: ONBOARDING_TASK_KIND,
    label: `${labelPrefix} context for ${opts.projectName}`,
    meta,
  });

  try {
    await generateOnboardingContext(
      taskId,
      opts.projectId,
      opts.description,
      opts.repoDirectories,
    );
  } catch (e) {
    useBackgroundTaskStore
      .getState()
      .fail(taskId, e instanceof Error ? e.message : 'Failed to start generation');
  }

  return taskId;
}

/**
 * Initialize once at app startup. Subscribes to onboarding IPC events and
 * routes them into the background task store. Returns an unsubscribe.
 */
export function initOnboardingTaskBridge(): () => void {
  if (!hasOnboardingApi()) return () => {};
  const store = useBackgroundTaskStore.getState();

  return subscribeToOnboardingEvents({
    onProgress: ({ taskId, message }) => {
      store.appendProgress(taskId, message);
    },
    // Thinking output is intentionally ignored — debug surface, not user-facing.
    onComplete: ({ taskId, content }) => {
      useBackgroundTaskStore.getState().complete(taskId, { result: content });
    },
    onError: ({ taskId, error }) => {
      useBackgroundTaskStore.getState().fail(taskId, error);
    },
  });
}
