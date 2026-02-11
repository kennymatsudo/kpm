/**
 * Search Store - Global search overlay state.
 */

import { create } from 'zustand';
import type { SearchResult, SearchTab } from '../../shared/types';

interface SearchState {
  isOpen: boolean;
  query: string;
  results: SearchResult[];
  selectedIndex: number;
  isSearching: boolean;
  activeTab: SearchTab;

  openSearch: (defaultTab?: SearchTab) => void;
  closeSearch: () => void;
  setQuery: (query: string) => void;
  setResults: (results: SearchResult[]) => void;
  setSelectedIndex: (index: number) => void;
  setIsSearching: (loading: boolean) => void;
  setActiveTab: (tab: SearchTab) => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  isOpen: false,
  query: '',
  results: [],
  selectedIndex: 0,
  isSearching: false,
  activeTab: 'all',

  openSearch: (defaultTab) => set({ isOpen: true, query: '', results: [], selectedIndex: 0, isSearching: false, activeTab: defaultTab ?? 'all' }),
  closeSearch: () => set({ isOpen: false, query: '', results: [], selectedIndex: 0, isSearching: false, activeTab: 'all' }),
  setQuery: (query) => set({ query, selectedIndex: 0 }),
  setResults: (results) => set({ results, isSearching: false }),
  setSelectedIndex: (index) => set({ selectedIndex: index }),
  setIsSearching: (loading) => set({ isSearching: loading }),
  setActiveTab: (tab) => set({ activeTab: tab, selectedIndex: 0 }),
}));
