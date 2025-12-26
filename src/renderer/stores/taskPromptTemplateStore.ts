import { create } from 'zustand';

type TemplateScope = 'global' | 'project';

  // Data
  currentProjectId: string | null;
  selectedTemplateId: string | null;
  isLoading: boolean;
  scope: TemplateScope;

  // Actions
  setSelectedTemplateId: (id: string | null) => void;
  setScope: (scope: TemplateScope) => void;
  setIsLoading: (isLoading: boolean) => void;

  // Load function
  loadTemplates: (scope: TemplateScope, currentProjectId: string | null) => Promise<void>;

  // Helpers

  // Reset
  reset: () => void;
}

const initialState = {
  currentProjectId: null as string | null,
  selectedTemplateId: null as string | null,
  isLoading: false,
  scope: 'global' as TemplateScope,
};

let loadTemplatesRequestId = 0;

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
          scope === 'global' ? t.project_id === null : t.project_id === currentProjectId
        );

        const currentSelectedId = get().selectedTemplateId;

        // Auto-select: keep current selection if still valid, otherwise pick first
        let newSelectedId = currentSelectedId;
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

  getSelectedTemplate: () => {
    const state = get();
    return state.templates.find((t) => t.id === state.selectedTemplateId) || null;
  },

  reset: () => {
    loadTemplatesRequestId += 1;
    set(initialState);
  },
}));
