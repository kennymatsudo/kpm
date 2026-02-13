/**
 * Prompt Override Store
 *
 * Manages state for the configurable prompts editor in Settings.
 */

import { create } from 'zustand';
import type { PromptCategory, PromptDefinitionInfo } from '../../shared/types';

interface PromptDetail extends PromptDefinitionInfo {
  defaultContent: string;
  currentContent: string;
}

interface PromptOverrideState {
  /** All prompt definitions with override status */
  prompts: PromptDefinitionInfo[];
  /** Currently selected prompt key */
  selectedKey: string | null;
  /** Full detail of the selected prompt (loaded on demand) */
  selectedPrompt: PromptDetail | null;
  /** Active category filter */
  /** Content being edited in the textarea */
  editContent: string;
  /** Loading state */
  isLoading: boolean;
  /** Save feedback */
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  /** Error message */
  error: string | null;

  // Actions
  loadPrompts: () => Promise<void>;
  selectPrompt: (key: string) => Promise<void>;
  setEditContent: (content: string) => void;
  saveOverride: () => Promise<void>;
  resetToDefault: () => Promise<void>;
}

export const usePromptOverrideStore = create<PromptOverrideState>((set, get) => ({
  prompts: [],
  selectedKey: null,
  selectedPrompt: null,
  activeCategory: 'system',
  editContent: '',
  isLoading: false,
  saveStatus: 'idle',
  error: null,

  loadPrompts: async () => {
    set({ isLoading: true, error: null });
    try {
      if (result.success && result.prompts) {
        set({ prompts: result.prompts, isLoading: false });
      } else {
        set({ error: result.error || 'Failed to load prompts', isLoading: false });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load prompts', isLoading: false });
    }
  },

  setCategory: (category) => {
    set({ activeCategory: category, selectedKey: null, selectedPrompt: null, editContent: '', saveStatus: 'idle' });
  },

  selectPrompt: async (key) => {
    set({ selectedKey: key, saveStatus: 'idle', error: null });
    try {
      if (result.success && result.prompt) {
        set({
          editContent: result.prompt.currentContent,
        });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load prompt' });
    }
  },

  setEditContent: (content) => {
    set({ editContent: content, saveStatus: 'idle' });
  },

  saveOverride: async () => {
    const { selectedKey, editContent } = get();
    if (!selectedKey) return;

    set({ saveStatus: 'saving' });
    try {
      if (result.success) {
        set({ saveStatus: 'saved' });
        // Reload to update override status
        await get().loadPrompts();
        await get().selectPrompt(selectedKey);
        // Reset status after brief delay
        setTimeout(() => {
          if (get().saveStatus === 'saved') {
            set({ saveStatus: 'idle' });
          }
        }, 2000);
      } else {
        set({ saveStatus: 'error', error: result.error || 'Failed to save' });
      }
    } catch (err) {
      set({ saveStatus: 'error', error: err instanceof Error ? err.message : 'Failed to save' });
    }
  },

  resetToDefault: async () => {
    const { selectedKey } = get();
    if (!selectedKey) return;

    set({ saveStatus: 'saving' });
    try {
      if (result.success) {
        set({ saveStatus: 'saved' });
        // Reload to update override status and content
        await get().loadPrompts();
        await get().selectPrompt(selectedKey);
        setTimeout(() => {
          if (get().saveStatus === 'saved') {
            set({ saveStatus: 'idle' });
          }
        }, 2000);
      } else {
        set({ saveStatus: 'error', error: result.error || 'Failed to reset' });
      }
    } catch (err) {
      set({ saveStatus: 'error', error: err instanceof Error ? err.message : 'Failed to reset' });
    }
  },
}));
