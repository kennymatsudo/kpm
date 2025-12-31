import type { SliceCreator, UiSlice } from './types';
import { resourceEquals } from '../../utils/focusedResources';

export const createUiSlice: SliceCreator<UiSlice> = (_deps) => (set, get) => ({

  addFocusedResource: (resource) => {
    }
  },

  removeFocusedResource: (resource) => {
  },


  setEditingItemId: (itemId) => set({ editingItemId: itemId }),
  setLoading: (isLoading) => set({ isLoading }),
  setSwitchingProject: (isSwitchingProject) => set({ isSwitchingProject }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
});
