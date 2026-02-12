/**
 * GlobalSearch - Full-screen search overlay (Cmd+Shift+F).
 *
 * Searches across plan items and documents within the current project.
 */

import { useEffect, useCallback, useRef, useMemo } from 'react';
import { emit } from '../../stores/storeEvents';
import { SearchResultItem } from './SearchResultItem';
import { SectionHeader } from './SectionHeader';
import { EntityIcon } from './EntityIcon';
import { LoadingSpinner } from '../ui/LoadingButton';
import type { SearchResult, SearchEntityType, SearchTab } from '../../../shared/types';

const SECTION_ORDER: SearchEntityType[] = ['plan_item', 'document'];

const TAB_META: { tab: SearchTab; label: string; entityType?: SearchEntityType }[] = [
  { tab: 'all', label: 'All' },
  { tab: 'plan_item', label: 'Tasks', entityType: 'plan_item' },
  { tab: 'document', label: 'Docs', entityType: 'document' },
];

/** Group flat results by entity type, preserving a stable display order. */
function groupResults(results: SearchResult[]) {
  const groups = new Map<SearchEntityType, SearchResult[]>();
  for (const r of results) {
    const list = groups.get(r.entityType);
    if (list) list.push(r);
    else groups.set(r.entityType, [r]);
  }
  return SECTION_ORDER
    .filter((t) => groups.has(t))
    .map((type) => ({ type, items: groups.get(type)! }));
}

export function GlobalSearch() {
  const { isOpen, query, results, selectedIndex, isSearching, activeTab, closeSearch, setQuery, setResults, setSelectedIndex, setIsSearching, setActiveTab } = useSearchStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
            setResults(data);
          }
        } catch (error) {
          console.error('[GlobalSearch] Search error:', error);
        }
      })();
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, currentProjectId, isOpen, setResults, setIsSearching]);

  // Per-type counts from full (unfiltered) results
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: results.length };
    for (const r of results) {
      counts[r.entityType] = (counts[r.entityType] ?? 0) + 1;
    }
    return counts;
  }, [results]);

  // Filtered results based on active tab
  const filteredResults = useMemo(() => {
    if (activeTab === 'all') return results;
    return results.filter((r) => r.entityType === activeTab);
  }, [results, activeTab]);

  // Grouped results (only used when activeTab is 'all')
  const grouped = useMemo(() => groupResults(filteredResults), [filteredResults]);

  // Navigate to a result
  const navigateToResult = useCallback((result: SearchResult) => {
    closeSearch();

    switch (result.entityType) {
      case 'plan_item':
        emit({ type: 'navigate-to-view', payload: { view: 'planning', planItemId: result.id } });
        break;

      case 'document':
        emit({ type: 'navigate-to-view', payload: { view: 'workspace', filePath: result.id } });
        break;
    }
  }, [closeSearch]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        closeSearch();
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (filteredResults.length > 0) {
          const next = (selectedIndex + 1) % filteredResults.length;
          setSelectedIndex(next);
          listRef.current
            ?.querySelector(`[data-result-index="${next}"]`)
            ?.scrollIntoView({ block: 'nearest' });
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (filteredResults.length > 0) {
          const prev = (selectedIndex - 1 + filteredResults.length) % filteredResults.length;
          setSelectedIndex(prev);
          listRef.current
            ?.querySelector(`[data-result-index="${prev}"]`)
            ?.scrollIntoView({ block: 'nearest' });
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredResults[selectedIndex]) {
          navigateToResult(filteredResults[selectedIndex]);
        }
        break;
    }
  }, [isOpen, filteredResults, selectedIndex, closeSearch, setSelectedIndex, navigateToResult]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);

  if (!isOpen) return null;

  const hasQuery = query.trim().length > 0;
  const showEmptyState = !hasQuery;
  const showNoResults = hasQuery && filteredResults.length === 0 && !isSearching;
  const showResults = hasQuery && filteredResults.length > 0;
  const showSearching = hasQuery && results.length === 0 && isSearching;

  return (
      searchPlaceholder="Search tasks, docs..."
                </div>
                </div>
              )}
              )}


                  </div>
                </div>
          </div>
  );
}
