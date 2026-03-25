import { create } from 'zustand';
import type { TaskPromptTemplate } from '../../shared/types';

type TemplateScope = 'global' | 'project';

interface TaskPromptTemplateState {
  // Data
  currentProjectId: string | null;
  templates: TaskPromptTemplate[];
  selectedTemplateId: string | null;
  isLoading: boolean;
  scope: TemplateScope;

  // Actions
  setTemplates: (templates: TaskPromptTemplate[]) => void;
  setSelectedTemplateId: (id: string | null) => void;
  setScope: (scope: TemplateScope) => void;
  setIsLoading: (isLoading: boolean) => void;

  // Load function
  loadTemplates: (scope: TemplateScope, currentProjectId: string | null) => Promise<void>;
  loadBuiltinDefault: () => Promise<{ success: boolean; promptContent?: string; error?: string }>;
  saveTemplate: (name: string, promptContent: string) => Promise<{ success: boolean; template?: TaskPromptTemplate; error?: string }>;
  deleteSelectedTemplate: () => Promise<{ success: boolean; error?: string }>;
  setSelectedTemplateAsDefault: () => Promise<{ success: boolean; template?: TaskPromptTemplate; error?: string }>;

  // Helpers
  getSelectedTemplate: () => TaskPromptTemplate | null;

  // Reset
  reset: () => void;
}

const initialState = {
  currentProjectId: null as string | null,
  templates: [] as TaskPromptTemplate[],
  selectedTemplateId: null as string | null,
  isLoading: false,
  scope: 'global' as TemplateScope,
};

let loadTemplatesRequestId = 0;

export const useTaskPromptTemplateStore = create<TaskPromptTemplateState>((set, get) => ({
  ...initialState,

  setTemplates: (templates) => set({ templates }),
  setSelectedTemplateId: (id) => set({ selectedTemplateId: id }),
  setScope: (scope) => set({ scope }),
  setIsLoading: (isLoading) => set({ isLoading }),

  loadTemplates: async (scope, currentProjectId) => {
    const requestId = ++loadTemplatesRequestId;
    const state = get();
    const targetProjectId = scope === 'project' ? currentProjectId : null;
    const isSameTarget = state.scope === scope && state.currentProjectId === targetProjectId;

    if (!isSameTarget) {
      // Avoid showing stale templates when switching scope/project
      set({
        currentProjectId: targetProjectId,
        templates: [],
        selectedTemplateId: null,
        isLoading: true,
        scope,
      });
    } else if (state.templates.length === 0) {
      // Only show loading if no templates yet (prevents flash on refresh)
      set({ isLoading: true });
    }

    try {
      const projectId = targetProjectId;
      if (
        requestId !== loadTemplatesRequestId ||
        get().scope !== scope ||
        get().currentProjectId !== targetProjectId
      ) {
        return;
      }
      if (result.success && result.templates) {
        // Filter based on scope
        const filtered = result.templates.filter((t: TaskPromptTemplate) =>
          scope === 'global' ? t.project_id === null : t.project_id === currentProjectId
        );

        const currentSelectedId = get().selectedTemplateId;

        // Auto-select: keep current selection if still valid, otherwise pick first
        let newSelectedId = currentSelectedId;
        if (!currentSelectedId || !filtered.find((t: TaskPromptTemplate) => t.id === currentSelectedId)) {
          newSelectedId = filtered[0]?.id || null;
        }

        set({
          currentProjectId: targetProjectId,
          templates: filtered,
          selectedTemplateId: newSelectedId,
          isLoading: false,
          scope,
        });
      } else {
        set({ isLoading: false });
      }
    } catch (err) {
      console.error('[TaskPromptTemplateStore] Failed to load templates:', err);
      if (
        requestId !== loadTemplatesRequestId ||
        get().scope !== scope ||
        get().currentProjectId !== targetProjectId
      ) {
        return;
      }
      set({ isLoading: false });
    }
  },


  saveTemplate: async (name, promptContent) => {
    const state = get();
    const trimmedName = name.trim();
    if (!trimmedName) {
      return { success: false, error: 'Template name is required' };
    }

    if (state.scope === 'project' && !state.currentProjectId) {
      return { success: false, error: 'Project scope is unavailable without an open project' };
    }

    const projectId = state.scope === 'project' ? state.currentProjectId : null;
    const result = state.selectedTemplateId

    if (!result.success || !result.template) {
      return { success: false, error: result.error || 'Failed to save template' };
    }

    await get().loadTemplates(state.scope, state.currentProjectId);
    set({ selectedTemplateId: result.template.id });
    return { success: true, template: result.template };
  },

  deleteSelectedTemplate: async () => {
    const state = get();
    if (!state.selectedTemplateId) {
      return { success: false, error: 'No template selected' };
    }

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to delete template' };
    }

    set({ selectedTemplateId: null });
    await get().loadTemplates(state.scope, state.currentProjectId);
    return { success: true };
  },

  setSelectedTemplateAsDefault: async () => {
    const state = get();
    if (!state.selectedTemplateId) {
      return { success: false, error: 'No template selected' };
    }

    if (!result.success || !result.template) {
      return { success: false, error: result.error || 'Failed to set default' };
    }

    await get().loadTemplates(state.scope, state.currentProjectId);
    set({ selectedTemplateId: result.template.id });
    return { success: true, template: result.template };
  },

  getSelectedTemplate: () => {
    const state = get();
    return state.templates.find((t) => t.id === state.selectedTemplateId) || null;
  },

  reset: () => {
    loadTemplatesRequestId += 1;
    set(initialState);
  },
}));
