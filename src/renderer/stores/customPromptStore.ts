/**
 * Custom Prompt Store
 *
 * Manages state for custom prompts used in Command+K palette.
 * All prompts are global (no project-specific scope).
 */

import { create } from 'zustand';
import {
  createCustomPrompt,
  deleteCustomPrompt,
  listCustomPrompts,
  updateCustomPrompt,
} from '../services/promptService';

interface CustomPromptState {
  // Data
  prompts: CustomPrompt[];
  selectedPromptId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setPrompts: (prompts: CustomPrompt[]) => void;
  setSelectedPromptId: (id: string | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;

  // Load function
  loadPrompts: () => Promise<void>;

  // CRUD actions
  createPrompt: (
    name: string,
    promptContent: string,
    options?: {
      description?: string | null;
      icon?: CustomPromptIcon;
      keywords?: string | null;
    }
  ) => Promise<CustomPrompt | null>;
  updatePrompt: (
    promptId: string,
    updates: {
      name?: string;
      description?: string | null;
      promptContent?: string;
      icon?: CustomPromptIcon;
      keywords?: string | null;
    }
  ) => Promise<boolean>;
  deletePrompt: (promptId: string) => Promise<boolean>;

  // Helpers
  getSelectedPrompt: () => CustomPrompt | null;
  getPromptById: (id: string) => CustomPrompt | null;

  // Reset
  reset: () => void;
}

const initialState = {
  prompts: [] as CustomPrompt[],
  selectedPromptId: null as string | null,
  isLoading: false,
  error: null as string | null,
};

let loadPromptsRequestId = 0;

export const useCustomPromptStore = create<CustomPromptState>((set, get) => ({
  ...initialState,

  setPrompts: (prompts) => set({ prompts }),
  setSelectedPromptId: (id) => set({ selectedPromptId: id }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  loadPrompts: async () => {
    const requestId = ++loadPromptsRequestId;
    const state = get();

    if (state.prompts.length === 0) {
      // Only show loading if no prompts yet (prevents flash on refresh)
      set({ isLoading: true });
    }

    try {
      const result = await listCustomPrompts();

      // Check for stale request
      if (requestId !== loadPromptsRequestId) {
        return;
      }

      if (result.success && result.data) {
        const currentSelectedId = get().selectedPromptId;

        // Auto-select: keep current selection if still valid, otherwise pick first
        let newSelectedId = currentSelectedId;
        if (!currentSelectedId || !result.data.find((p: CustomPrompt) => p.id === currentSelectedId)) {
          newSelectedId = result.data[0]?.id || null;
        }

        set({
          prompts: result.data,
          selectedPromptId: newSelectedId,
          isLoading: false,
          error: null,
        });
      } else {
        set({ isLoading: false, error: result.error || 'Failed to load prompts' });
      }
    } catch (err) {
      console.error('[CustomPromptStore] Failed to load prompts:', err);
      if (requestId !== loadPromptsRequestId) {
        return;
      }
      set({ isLoading: false, error: String(err) });
    }
  },

  createPrompt: async (name, promptContent, options) => {
    try {
      const result = await createCustomPrompt(name, promptContent, options);
      if (result.success && result.data) {
        // Add to local state
        const prompts = [...get().prompts, result.data];
        set({ prompts, selectedPromptId: result.data.id, error: null });
        return result.data;
      } else {
        set({ error: result.error || 'Failed to create prompt' });
        return null;
      }
    } catch (err) {
      console.error('[CustomPromptStore] Failed to create prompt:', err);
      set({ error: String(err) });
      return null;
    }
  },

  updatePrompt: async (promptId, updates) => {
    try {
      const result = await updateCustomPrompt(promptId, updates);
      if (result.success) {
        // Update local state
        const prompts = get().prompts.map((p) => {
          if (p.id === promptId) {
            return {
              ...p,
              ...(updates.name !== undefined && { name: updates.name }),
              ...(updates.description !== undefined && { description: updates.description }),
              ...(updates.promptContent !== undefined && { prompt_content: updates.promptContent }),
              ...(updates.icon !== undefined && { icon: updates.icon }),
              ...(updates.keywords !== undefined && { keywords: updates.keywords }),
              updated_at: new Date().toISOString(),
            };
          }
          return p;
        });
        set({ prompts, error: null });
        return true;
      } else {
        set({ error: result.error || 'Failed to update prompt' });
        return false;
      }
    } catch (err) {
      console.error('[CustomPromptStore] Failed to update prompt:', err);
      set({ error: String(err) });
      return false;
    }
  },

  deletePrompt: async (promptId) => {
    try {
      const result = await deleteCustomPrompt(promptId);
      if (result.success) {
        // Remove from local state
        const prompts = get().prompts.filter((p) => p.id !== promptId);
        const selectedId = get().selectedPromptId;

        // If deleted prompt was selected, select first remaining prompt
        const newSelectedId = selectedId === promptId
          ? prompts[0]?.id || null
          : selectedId;

        set({ prompts, selectedPromptId: newSelectedId, error: null });
        return true;
      } else {
        set({ error: result.error || 'Failed to delete prompt' });
        return false;
      }
    } catch (err) {
      console.error('[CustomPromptStore] Failed to delete prompt:', err);
      set({ error: String(err) });
      return false;
    }
  },

  getSelectedPrompt: () => {
    const state = get();
    return state.prompts.find((p) => p.id === state.selectedPromptId) || null;
  },

  getPromptById: (id) => {
    return get().prompts.find((p) => p.id === id) || null;
  },

  reset: () => {
    loadPromptsRequestId += 1;
    set(initialState);
  },
}));
