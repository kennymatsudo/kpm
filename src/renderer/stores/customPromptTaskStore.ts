/**
 * Custom Prompt Task Store
 *
 * Tracks in-flight Cmd+K custom prompt generations so the UI can show a
 * top-bar indicator while they run and a completion toast when they finish.
 *
 * Not project-scoped: a generation continues running after the user switches
 * projects (the file lands in the project it was started against).
 */

import { create } from 'zustand';
import { toast } from './toastStore';
import { showWorkspaceFileInFolder } from '../services/workspaceFileService';
import {
  subscribeToCustomPromptComplete,
  subscribeToCustomPromptError,
} from '../services/promptService';

export interface RunningCustomPromptTask {
  taskId: string;
  promptName: string;
  projectId: string;
  startedAt: number;
}

interface CustomPromptTaskState {
  running: RunningCustomPromptTask[];
  startTask: (task: RunningCustomPromptTask) => void;
  completeTask: (taskId: string, filePath: string, promptName: string) => void;
  errorTask: (taskId: string, error: string) => void;
  dismissTask: (taskId: string) => void;
  reapStaleTasks: () => void;
}

/**
 * Hard cap for how long a task can stay "running" in the UI before we assume
 * the completion/error event was lost (HMR reload, missed IPC, main crash).
 *
 * Why: the badge has no main-process source of truth — if the IPC event is
 * dropped, the badge would otherwise stick forever. Generations are bounded
 * by the main-process artifactGenerationTimeoutMs (5 min); we add a buffer so
 * the watchdog only triggers after the main process has definitely given up.
 */
const STALE_TASK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export const useCustomPromptTaskStore = create<CustomPromptTaskState>((set, get) => ({
  running: [],

  startTask: (task) => {
    set((state) => ({ running: [...state.running, task] }));
  },

  completeTask: (taskId, filePath, promptName) => {
    const task = get().running.find((t) => t.taskId === taskId);
    set((state) => ({ running: state.running.filter((t) => t.taskId !== taskId) }));

    const projectId = task?.projectId;
    toast.success(
      `"${promptName}" finished`,
      projectId
        ? {
            label: 'Open',
            onClick: () => {
              void showWorkspaceFileInFolder('project', filePath, projectId);
            },
          }
        : undefined,
    );
  },

  errorTask: (taskId, error) => {
    const task = get().running.find((t) => t.taskId === taskId);
    set((state) => ({ running: state.running.filter((t) => t.taskId !== taskId) }));
    const name = task?.promptName ?? 'Custom prompt';
    toast.error(`"${name}" failed: ${error}`);
  },

  dismissTask: (taskId) => {
    set((state) => ({ running: state.running.filter((t) => t.taskId !== taskId) }));
  },

  reapStaleTasks: () => {
    const cutoff = Date.now() - STALE_TASK_TIMEOUT_MS;
    const stale = get().running.filter((t) => t.startedAt < cutoff);
    if (stale.length === 0) return;
    set((state) => ({ running: state.running.filter((t) => t.startedAt >= cutoff) }));
    for (const task of stale) {
      toast.warning(
        `"${task.promptName}" status unknown — check the project's outputs folder`,
      );
    }
  },
}));

/**
 * Initialize IPC listeners for custom-prompt completion / error events.
 * Call once on app startup; returns an unsubscribe function.
 */
export function initCustomPromptTaskListeners(): () => void {
  const unsubscribeComplete = subscribeToCustomPromptComplete((data) => {
    useCustomPromptTaskStore.getState().completeTask(data.taskId, data.filePath, data.promptName);
  });
  const unsubscribeError = subscribeToCustomPromptError((data) => {
    useCustomPromptTaskStore.getState().errorTask(data.taskId, data.error);
  });

  // Watchdog for stale tasks (lost IPC events from HMR reloads, main crashes, etc.)
  const reaperInterval = setInterval(
    () => useCustomPromptTaskStore.getState().reapStaleTasks(),
    60 * 1000,
  );

  return () => {
    unsubscribeComplete();
    unsubscribeError();
    clearInterval(reaperInterval);
  };
}
