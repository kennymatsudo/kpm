import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { PlanItem, StatusCategory } from '../../../../shared/types';
import { useLocalStorageSet } from '../../../hooks/useLocalStorageSet';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import {
  selectFilteredPlannedItems,
  selectNormalizedPlanItems,
  selectPlanSearchResultCount,
} from '../../../stores';
import { logPerfEvent } from '../../../utils/perfLogger';

interface StatusCounts {
  total: number;
  visible: number;
}

const isSearchCleared = (v: string) => v.trim() === '';

export interface UseLayoutPlanViewStateReturn {
  searchQuery: string;
  debouncedSearchQuery: string;
  setSearchQuery: (query: string) => void;
  hiddenStatusCategories: Set<StatusCategory>;
  hiddenStatusCategoriesRef: MutableRefObject<Set<StatusCategory>>;
  setHiddenStatusCategories: (categories: Set<StatusCategory>) => void;
  selectedItemIds: Set<string>;
  setSelectedItemIds: Dispatch<SetStateAction<Set<string>>>;
  clearSelectedItemIds: () => void;
  filteredPlannedItems: PlanItem[];
  statusCounts: StatusCounts;
  searchResultCount: number | undefined;
}

export function useLayoutPlanViewState(
  currentProjectId: string | null,
  planItems: PlanItem[]
): UseLayoutPlanViewStateReturn {
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300, isSearchCleared);
  const [hiddenStatusCategories, setHiddenStatusCategories] = useLocalStorageSet<StatusCategory>(
    currentProjectId ? `kpm-status-filter-${currentProjectId}` : null
  );
  const hiddenStatusCategoriesRef = useRef(hiddenStatusCategories);
  const prevSearchQueryRef = useRef('');

  useEffect(() => {
    setSelectedItemIds(new Set());
    setSearchQuery('');
  }, [currentProjectId]);

  useEffect(() => {
    hiddenStatusCategoriesRef.current = hiddenStatusCategories;
  }, [hiddenStatusCategories]);

  const normalizedPlan = useMemo(() => selectNormalizedPlanItems(planItems), [planItems]);
  const plannedItems = normalizedPlan.plannedItems;
  const filteredPlannedItems = useMemo(
  );
  const statusCounts = useMemo<StatusCounts>(
    () => ({
      total: plannedItems.length,
      visible: filteredPlannedItems.length,
    }),
    [filteredPlannedItems.length, plannedItems.length]
  );
  const searchResultCount = useMemo(
    () => selectPlanSearchResultCount(filteredPlannedItems, debouncedSearchQuery),
    [filteredPlannedItems, debouncedSearchQuery]
  );

  useEffect(() => {
    const previous = prevSearchQueryRef.current;
    if (previous === debouncedSearchQuery) return;
    prevSearchQueryRef.current = debouncedSearchQuery;

    const trimmed = debouncedSearchQuery.trim();
    if (trimmed.length >= 2) {
      logPerfEvent('search.query', {
        length: trimmed.length,
        resultCount: searchResultCount ?? null,
      });
    } else if (previous && !trimmed) {
      logPerfEvent('search.clear', { prevLength: previous.length });
    }
  }, [debouncedSearchQuery, searchResultCount]);

  const clearSelectedItemIds = useCallback(() => {
    setSelectedItemIds(new Set());
  }, []);

  return {
    searchQuery,
    debouncedSearchQuery,
    setSearchQuery,
    hiddenStatusCategories,
    hiddenStatusCategoriesRef,
    setHiddenStatusCategories,
    selectedItemIds,
    setSelectedItemIds,
    clearSelectedItemIds,
    filteredPlannedItems,
    statusCounts,
    searchResultCount,
  };
}
