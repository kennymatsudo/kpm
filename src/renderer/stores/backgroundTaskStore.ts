/**
 * Generic background task store.
 *
 * Kind-agnostic registry of long-running tasks (onboarding context generation,
 * codex runs, future agent operations, etc.) that should survive UI dismissal.
 * Owners (modals, wizards) write task records here; a topbar badge reads them
 * and resumes the originating UI on click via a kind-specific handler.
 *
 * Not project-scoped — tasks may continue across project switches if relevant.
 */

import { create } from 'zustand';

export type BackgroundTaskStatus = 'running' | 'completed' | 'error';

export interface BackgroundTask<TMeta = unknown> {
  id: string;
  kind: string;
  label: string;
  status: BackgroundTaskStatus;
  startedAt: number;
  completedAt?: number;
  messages: string[];
  result?: string;
  error?: string;
  /** Kind-specific opaque payload; consumers cast based on `kind`. */
  meta: TMeta;
}

interface BackgroundTaskState {
  tasks: Record<string, BackgroundTask>;

  appendProgress: (id: string, message: string) => void;
  complete: (id: string, opts?: { result?: string }) => void;
  fail: (id: string, error: string) => void;
  dismiss: (id: string) => void;
  reapStale: () => void;
}


export const useBackgroundTaskStore = create<BackgroundTaskState>((set, get) => ({
  tasks: {},

  start: (task) => {
    set((state) => ({
      tasks: {
        ...state.tasks,
        [task.id]: {
          ...task,
          status: 'running',
          startedAt: Date.now(),
          messages: [],
        },
      },
    }));
  },

  appendProgress: (id, message) => {
    set((state) => {
      const existing = state.tasks[id];
      if (!existing) return state;
      return {
        tasks: {
          ...state.tasks,
        },
      };
    });
  },

  complete: (id, opts) => {
    set((state) => {
      const existing = state.tasks[id];
      if (!existing) return state;
      return {
        tasks: {
          ...state.tasks,
          [id]: {
            ...existing,
            status: 'completed',
            completedAt: Date.now(),
            result: opts?.result,
          },
        },
      };
    });
  },

  fail: (id, error) => {
    set((state) => {
      const existing = state.tasks[id];
      if (!existing) return state;
      return {
        tasks: {
          ...state.tasks,
          [id]: {
            ...existing,
            status: 'error',
            completedAt: Date.now(),
            error,
          },
        },
      };
    });
  },

  dismiss: (id) => {
    set((state) => {
      if (!state.tasks[id] || state.tasks[id].status === 'running') return state;
      const next = { ...state.tasks };
      delete next[id];
      return { tasks: next };
    });
  },

  reapStale: () => {
    const cutoff = Date.now() - STALE_TASK_TIMEOUT_MS;
    const tasks = get().tasks;
    const stale = Object.values(tasks).filter(
    );
    if (stale.length === 0) return;
    set((state) => {
      const next = { ...state.tasks };
      for (const t of stale) {
        next[t.id] = {
          ...t,
          status: 'error',
          completedAt: Date.now(),
        };
      }
      return { tasks: next };
    });
  },
}));

export function selectAllTasks(state: BackgroundTaskState): BackgroundTask[] {
  return Object.values(state.tasks).sort((a, b) => b.startedAt - a.startedAt);
}
