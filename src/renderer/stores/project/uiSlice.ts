import type { SliceCreator, UiSlice } from './types';
import { resourceEquals } from '../../utils/focusedResources';

function getActiveChatSessionId(createIfMissing: boolean): string | null {
  const chatState = useChatStore.getState();
  if (chatState.viewedSessionId) return chatState.viewedSessionId;
  return createIfMissing ? chatState.getChatSessionId() : null;
}

export const createUiSlice: SliceCreator<UiSlice> = (_deps) => (set, get) => ({
  setFocusedResources: (resources) => {
    const chatSessionId = getActiveChatSessionId(true);
    if (!chatSessionId) {
      set({ focusedResources: resources });
      return;
    }

    set((state) => ({
      focusedResources: resources,
      focusedResourcesBySession: {
        ...state.focusedResourcesBySession,
        [chatSessionId]: resources,
      },
    }));
  },

  addFocusedResource: (resource) => {
    const chatSessionId = getActiveChatSessionId(true);
    const current = chatSessionId
      ? (get().focusedResourcesBySession[chatSessionId] ?? [])
      : get().focusedResources;


    const next = [...current, resource];

    if (!chatSessionId) {
      set({ focusedResources: next });
    }

    set((state) => ({
      focusedResources: next,
      focusedResourcesBySession: {
        ...state.focusedResourcesBySession,
        [chatSessionId]: next,
      },
    }));
  },

  removeFocusedResource: (resource) => {
    const chatSessionId = getActiveChatSessionId(false);
    const current = chatSessionId
      ? (get().focusedResourcesBySession[chatSessionId] ?? [])
      : get().focusedResources;
    const next = current.filter((r) => !resourceEquals(r, resource));

    if (!chatSessionId) {
      set({ focusedResources: next });
      return;
    }

    set((state) => ({
      focusedResources: next,
      focusedResourcesBySession: {
        ...state.focusedResourcesBySession,
        [chatSessionId]: next,
      },
    }));
  },

  clearFocusedResources: () => {
    const chatSessionId = getActiveChatSessionId(false);
    if (!chatSessionId) {
      set({ focusedResources: [] });
      return;
    }

    set((state) => ({
      focusedResources: [],
      focusedResourcesBySession: {
        ...state.focusedResourcesBySession,
        [chatSessionId]: [],
      },
    }));
  },

  syncFocusedResourcesForSession: (chatSessionId) => set((state) => ({
    focusedResources: chatSessionId
      ? (state.focusedResourcesBySession[chatSessionId] ?? [])
      : [],
  })),

  setEditingItemId: (itemId) => set({ editingItemId: itemId }),
  setLoading: (isLoading) => set({ isLoading }),
  setSwitchingProject: (isSwitchingProject) => set({ isSwitchingProject }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
});
