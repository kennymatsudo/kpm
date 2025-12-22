
export const createUiSlice: SliceCreator<UiSlice> = (_deps) => (set, get) => ({

  addFocusedResource: (resource) => {
    }
  },

  removeFocusedResource: (resource) => {
  },


  setEditingItemId: (itemId) => set({ editingItemId: itemId }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
});
