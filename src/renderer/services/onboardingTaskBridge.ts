/**
 * Onboarding background-task bridge.
 *
 * Translates onboarding IPC events into mutations on the generic
 * `backgroundTaskStore`. Lets the modal close while generation continues —
 * a topbar badge can resume the user back into `RegenerateContextModal` when
 * the task completes (or errors).
 */

import { useBackgroundTaskStore } from '../stores/backgroundTaskStore';
import { useProposedChangeDisposal } from '../stores/proposedChangeDisposal';
import { useContextRegenerationStore } from '../stores/contextRegenerationStore';
import { useProjectDomainStore } from '../stores/projectDomains';
import { readContextFile } from './contextFileService';
import {
  generateOnboardingContext,
  hasOnboardingApi,
  subscribeToOnboardingEvents,
} from './onboardingService';

export const ONBOARDING_TASK_KIND = 'onboarding';

export interface OnboardingTaskMeta {
  projectId: string;
  projectName: string;
}

interface StartOnboardingTaskOpts {
  projectId: string;
  projectName: string;
  description: string;
  repoDirectories: Record<string, string[]>;
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
  };

  useBackgroundTaskStore.getState().start({
    id: taskId,
    kind: ONBOARDING_TASK_KIND,
    label: `Generating context for ${opts.projectName}`,
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
      const task = useBackgroundTaskStore.getState().tasks[taskId];
      const meta = task?.meta as OnboardingTaskMeta | undefined;
      const currentProjectId = useProjectDomainStore.getState().currentProjectId;
      const isRegenModalOpen = useContextRegenerationStore.getState().isOpen;

      // If the modal is open, its own generate → review flow owns the result.
      // If it belongs to a different (or no longer open) project, fall back to
      // the badge-resume path. Otherwise route it into Proposed Change disposal so
      // the user reviews it there instead of having to reopen the modal.
      if (!isRegenModalOpen && meta?.projectId === currentProjectId) {
        void (async () => {
          try {
            const existing = await readContextFile(meta.projectId);
            useProposedChangeDisposal.getState().propose({
              type: 'context-file', projectId: meta.projectId,
              oldContent: existing.content, newContent: content,
            });
            useBackgroundTaskStore.getState().complete(taskId, { result: content });
            useBackgroundTaskStore.getState().dismiss(taskId);
          } catch {
            useBackgroundTaskStore.getState().complete(taskId, { result: content });
          }
        })();
        return;
      }

      useBackgroundTaskStore.getState().complete(taskId, { result: content });
    },
    onError: ({ taskId, error }) => {
      useBackgroundTaskStore.getState().fail(taskId, error);
    },
  });
}
