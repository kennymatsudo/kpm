import { useState, useEffect, useCallback, useMemo, type RefObject } from 'react';
import type { MarkdownToJSX } from 'markdown-to-jsx';

type ViewMode = 'diff' | 'preview' | 'edit';

interface MarkdownSearchDeps {
  draft: string;
  viewMode: ViewMode;
  previewRef: RefObject<HTMLDivElement | null>;
  searchInputRef: RefObject<HTMLInputElement | null>;
}

interface MarkdownSearchResult {
  showSearch: boolean;
  searchQuery: string;
  currentMatchIndex: number;
  totalMatches: number;
  setShowSearch: (show: boolean) => void;
  setSearchQuery: (query: string) => void;
  closeSearch: () => void;
  goToNextMatch: () => void;
  goToPrevMatch: () => void;
}

export function useMarkdownSearch({
  draft,
  viewMode,
  previewRef,
  searchInputRef,
}: MarkdownSearchDeps): MarkdownSearchResult {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Calculate total matches
  const totalMatches = useMemo(() => {
    if (!searchQuery || searchQuery.length === 0) return 0;
    const lowerDraft = draft.toLowerCase();
    const lowerQuery = searchQuery.toLowerCase();
    let count = 0;
    let index = lowerDraft.indexOf(lowerQuery);
    while (index !== -1) {
      count++;
      index = lowerDraft.indexOf(lowerQuery, index + 1);
    }
    return count;
  }, [draft, searchQuery]);

  // Reset current match when query changes or total matches change
  useEffect(() => {
    if (currentMatchIndex >= totalMatches) {
      setCurrentMatchIndex(Math.max(0, totalMatches - 1));
    }
  }, [totalMatches, currentMatchIndex]);

  }, [searchQuery, currentMatchIndex, showSearch]);

  // Scroll to current match in preview mode
  useEffect(() => {
    if (!showSearch || !searchQuery || viewMode === 'edit' || totalMatches === 0) return;

    const timeoutId = setTimeout(() => {
      const currentMatch = previewRef.current?.querySelector('[data-current="true"]');
      if (currentMatch) {
        currentMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [showSearch, searchQuery, currentMatchIndex, viewMode, totalMatches, previewRef]);

  // Focus search input when search opens
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  }, [showSearch, searchInputRef]);

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery('');
    setCurrentMatchIndex(0);
  }, []);

  const goToNextMatch = useCallback(() => {
    if (totalMatches === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % totalMatches);
  }, [totalMatches]);

  const goToPrevMatch = useCallback(() => {
    if (totalMatches === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + totalMatches) % totalMatches);
  }, [totalMatches]);

  return {
    showSearch,
    searchQuery,
    currentMatchIndex,
    totalMatches,
    setShowSearch,
    setSearchQuery,
    closeSearch,
    goToNextMatch,
    goToPrevMatch,
  };
}
