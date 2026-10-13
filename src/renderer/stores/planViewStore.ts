import { create } from 'zustand';

/** Search typing settles for this long before result filtering runs. */
const SEARCH_DEBOUNCE_MS = 300;

interface PlanViewState {
  selectedItemIds: Set<string>;
  /** What the search box shows; updates on every keystroke. */
  searchQuery: string;
  /** What filtering uses; follows `searchQuery` after a pause, or at once when cleared. */
  debouncedSearchQuery: string;
  setSelectedItemIds: (ids: Set<string>) => void;
  clearSelectedItemIds: () => void;
  setSearchQuery: (query: string) => void;
  reset: () => void;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function cancelDebounce() {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

/**
 * Selection and search for the planning view. Held outside `Layout` so a card
 * click or a keystroke re-renders only the components that read it, not the
 * whole shell. Not persisted; `useLayoutPlanViewState` resets it on project switch.
 */
export const usePlanViewStore = create<PlanViewState>()((set) => ({
  selectedItemIds: new Set(),
  searchQuery: '',
  debouncedSearchQuery: '',
  setSelectedItemIds: (ids) => set({ selectedItemIds: ids }),
  clearSelectedItemIds: () => set({ selectedItemIds: new Set() }),
  setSearchQuery: (query) => {
    cancelDebounce();
    if (query.trim() === '') {
      set({ searchQuery: query, debouncedSearchQuery: query });
      return;
    }
    set({ searchQuery: query });
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      set({ debouncedSearchQuery: query });
    }, SEARCH_DEBOUNCE_MS);
  },
  reset: () => {
    cancelDebounce();
    set({ selectedItemIds: new Set(), searchQuery: '', debouncedSearchQuery: '' });
  },
}));
