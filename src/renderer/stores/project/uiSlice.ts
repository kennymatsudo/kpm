
  setEditingItemId: (itemId) => set({ editingItemId: itemId }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
});
