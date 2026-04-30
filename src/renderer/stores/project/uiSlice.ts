import type { SliceCreator, UiSlice } from './types';
import { resourceEquals } from '../../utils/focusedResources';
import { useChatStore } from '../chat';

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

    if (current.some((r) => resourceEquals(r, resource))) {
      return { added: false };
    }

    const next = [...current, resource];

    if (!chatSessionId) {
      set({ focusedResources: next });
      return { added: true };
    }

    set((state) => ({
      focusedResources: next,
      focusedResourcesBySession: {
        ...state.focusedResourcesBySession,
        [chatSessionId]: next,
      },
    }));
    return { added: true };
  },

  addFocusedResources: (resources) => {
    if (resources.length === 0) return { added: 0, alreadyPresent: 0 };
    const chatSessionId = getActiveChatSessionId(true);
    const current = chatSessionId
      ? (get().focusedResourcesBySession[chatSessionId] ?? [])
      : get().focusedResources;

    const next = [...current];
    let added = 0;
    let alreadyPresent = 0;
    for (const resource of resources) {
      if (next.some((r) => resourceEquals(r, resource))) {
        alreadyPresent += 1;
        continue;
      }
      next.push(resource);
      added += 1;
    }

    if (added === 0) return { added, alreadyPresent };

    if (!chatSessionId) {
      set({ focusedResources: next });
      return { added, alreadyPresent };
    }

    set((state) => ({
      focusedResources: next,
      focusedResourcesBySession: {
        ...state.focusedResourcesBySession,
        [chatSessionId]: next,
      },
    }));
    return { added, alreadyPresent };
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
