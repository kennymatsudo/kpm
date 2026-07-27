/**
 * Action Store
 *
 * Actions are saved prompts that either run when invoked or on a trigger. Reads
 * are project-scoped: the list holds the project's own actions plus every global
 * one, which is what the repository returns.
 */

import { create } from 'zustand';
import type { ActionDefinition, ActionEditable, ActionRun } from '../../shared/actions';
import {
  createAction,
  deleteAction,
  getActionHistory,
  listActions,
  runActionNow,
  setActionEnabled,
  updateAction,
} from '../services/actionService';

interface ActionState {
  actions: ActionDefinition[];
  selectedActionId: string | null;
  isLoading: boolean;
  error: string | null;

  /** Run history for whichever action is selected. */
  history: ActionRun[];
  historyLoading: boolean;

  loadActions: (projectId: string) => Promise<void>;
  selectAction: (id: string | null) => void;
  create: (input: ActionEditable) => Promise<ActionDefinition | null>;
  update: (id: string, updates: Partial<ActionEditable>) => Promise<boolean>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  remove: (id: string) => Promise<boolean>;
  runNow: (id: string) => Promise<void>;
  loadHistory: (actionId: string) => Promise<void>;
  reset: () => void;
}

let loadRequestId = 0;

export const useActionStore = create<ActionState>((set, get) => ({
  actions: [],
  selectedActionId: null,
  isLoading: false,
  error: null,
  history: [],
  historyLoading: false,

  loadActions: async (projectId) => {
    const requestId = ++loadRequestId;
    set({ isLoading: true, error: null });
    const res = await listActions(projectId);
    // A newer load started while this one was in flight.
    if (requestId !== loadRequestId) return;

    if (res.success) {
      set({ actions: res.data ?? [], isLoading: false });
    } else {
      set({ error: res.error ?? 'Failed to load actions', isLoading: false });
    }
  },

  selectAction: (id) => {
    set({ selectedActionId: id, history: [] });
    if (id) void get().loadHistory(id);
  },

  create: async (input) => {
    const res = await createAction(input);
    if (!res.success || !res.data) {
      set({ error: res.error ?? 'Failed to create action' });
      return null;
    }
    set((state) => ({ actions: [res.data!, ...state.actions], selectedActionId: res.data!.id }));
    return res.data;
  },

  update: async (id, updates) => {
    const res = await updateAction(id, updates);
    if (!res.success || !res.data) {
      set({ error: res.error ?? 'Failed to save action' });
      return false;
    }
    set((state) => ({
      actions: state.actions.map((action) => (action.id === id ? res.data! : action)),
    }));
    return true;
  },

  setEnabled: async (id, enabled) => {
    const res = await setActionEnabled(id, enabled);
    if (!res.success || !res.data) {
      set({ error: res.error ?? 'Failed to change action' });
      return;
    }
    set((state) => ({
      actions: state.actions.map((action) => (action.id === id ? res.data! : action)),
    }));
  },

  remove: async (id) => {
    const res = await deleteAction(id);
    if (!res.success) {
      set({ error: res.error ?? 'Failed to delete action' });
      return false;
    }
    set((state) => ({
      actions: state.actions.filter((action) => action.id !== id),
      selectedActionId: state.selectedActionId === id ? null : state.selectedActionId,
    }));
    return true;
  },

  runNow: async (id) => {
    const res = await runActionNow(id);
    if (!res.success) set({ error: res.error ?? 'Failed to start the run' });
  },

  loadHistory: async (actionId) => {
    set({ historyLoading: true });
    const res = await getActionHistory(actionId, 20);
    set({
      history: res.success ? res.data ?? [] : [],
      historyLoading: false,
    });
  },

  reset: () => set({ actions: [], selectedActionId: null, history: [], error: null }),
}));
