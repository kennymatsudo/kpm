/**
 * GlobalSearch - Full-screen search overlay (Cmd+Shift+F).
 *
 * Searches across plan items and documents within the current project.
 */

import { useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchStore, useProjectDomainStore } from '../../stores';
import { emit } from '../../stores/storeEvents';
import { SearchResultItem } from './SearchResultItem';
import { SectionHeader } from './SectionHeader';
import { EntityIcon } from './EntityIcon';
import { LoadingSpinner } from '../ui/LoadingButton';
import { PaletteShell } from '../ui/PaletteShell';
import { searchProject } from '../../services/searchService';
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
  const currentProjectId = useProjectDomainStore((state) => state.currentProjectId);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const requestIdRef = useRef(0);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!isOpen || !currentProjectId) {
      requestIdRef.current += 1;
      return;
    }

    const requestId = ++requestIdRef.current;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(() => {
      const searchQuery = trimmed;
      void (async () => {
        try {
          const data = await searchProject(currentProjectId, searchQuery);
          const currentState = useSearchStore.getState();
          const isLatestRequest = requestId === requestIdRef.current;
          const isSameQuery = currentState.query.trim() === searchQuery;
          if (isLatestRequest && currentState.isOpen && isSameQuery) {
            setResults(data);
          }
        } catch (error) {
          console.error('[GlobalSearch] Search error:', error);
          const currentState = useSearchStore.getState();
          if (requestId === requestIdRef.current && currentState.isOpen) {
            setResults([]);
          }
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

  // Reset selection when switching tabs so the highlight doesn't point past the
  // end of the newly filtered list.
  useEffect(() => {
    setSelectedIndex(0);
  }, [activeTab, setSelectedIndex]);

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
    if (!isOpen) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const hasQuery = query.trim().length > 0;
  const showEmptyState = !hasQuery;
  const showNoResults = hasQuery && filteredResults.length === 0 && !isSearching;
  const showResults = hasQuery && filteredResults.length > 0;
  const showSearching = hasQuery && results.length === 0 && isSearching;

  return (
    <PaletteShell
      onClose={closeSearch}
      searchPlaceholder="Search tasks, docs..."
      searchValue={query}
      onSearchChange={setQuery}
      inputRef={inputRef}
      searchExtra={
        <>
          {isSearching && <LoadingSpinner className="w-4 h-4" color="accent" />}
          <kbd className="px-2 py-0.5 bg-surface-3 text-text-muted text-xs font-medium rounded-md border border-border-subtle">
            ESC
          </kbd>
        </>
      }
      footer={
        filteredResults.length > 0 ? (
          <div className="border-t border-border-default px-4 py-2.5 bg-surface-2">
            <div className="flex items-center justify-between text-xs text-text-tertiary">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 bg-surface-3 rounded border border-border-subtle">↑</kbd>
                  <kbd className="px-1.5 py-0.5 bg-surface-3 rounded border border-border-subtle">↓</kbd>
                  <span>Navigate</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 bg-surface-3 rounded border border-border-subtle">↵</kbd>
                  <span>Open</span>
                </div>
              </div>
              <span>{filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        ) : undefined
      }
    >
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border-default">
        {TAB_META.map(({ tab, label, entityType }) => {
          const count = typeCounts[tab] ?? 0;
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium
                transition-all duration-200
                ${isActive
                  ? 'bg-surface-3 text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary'}
              `}
            >
              {entityType && (
                <EntityIcon entityType={entityType} className="w-3.5 h-3.5" />
              )}
              <span>{label}</span>
              {hasQuery && (
                <span className={`tabular-nums ${isActive ? 'text-text-secondary' : 'text-text-muted'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Results */}
      <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-2">
        {showEmptyState && (
          <div className="px-6 py-10 text-center">
            <svg className="w-8 h-8 mx-auto mb-2 text-text-muted opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-text-muted text-sm font-medium">Search tasks and documents</p>
            <p className="text-text-tertiary text-xs mt-1">Type to search the project</p>
          </div>
        )}

        {showSearching && (
          <div className="px-6 py-10 text-center">
            <LoadingSpinner className="w-5 h-5 mx-auto mb-2" color="accent" />
            <p className="text-text-muted text-sm font-medium">Searching...</p>
          </div>
        )}

        {showNoResults && (
          <div className="px-6 py-10 text-center">
            <p className="text-text-muted text-sm font-medium">No results</p>
            <p className="text-text-tertiary text-xs mt-1">Try different keywords</p>
          </div>
        )}

        {showResults && activeTab === 'all' && (
          <div className="px-2">
            {(() => {
              let flatIndex = 0;
              return grouped.map((group, gi) => (
                <div key={group.type}>
                  <SectionHeader type={group.type} count={group.items.length} isFirst={gi === 0} />
                  <div className="space-y-0.5">
                    {group.items.map((result) => {
                      const idx = flatIndex++;
                      return (
                        <SearchResultItem
                          key={`${result.entityType}-${result.id}`}
                          result={result}
                          index={idx}
                          isSelected={idx === selectedIndex}
                          onSelect={() => navigateToResult(result)}
                          onHover={() => setSelectedIndex(idx)}
                          query={query}
                        />
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}

        {showResults && activeTab !== 'all' && (
          <div className="px-2 space-y-0.5">
            {filteredResults.map((result, idx) => (
              <SearchResultItem
                key={`${result.entityType}-${result.id}`}
                result={result}
                index={idx}
                isSelected={idx === selectedIndex}
                onSelect={() => navigateToResult(result)}
                onHover={() => setSelectedIndex(idx)}
                query={query}
              />
            ))}
          </div>
        )}
      </div>
    </PaletteShell>
  );
}
