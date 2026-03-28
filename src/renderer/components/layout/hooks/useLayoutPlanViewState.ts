import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { PlanItem, StatusCategory } from '../../../../shared/types';
import { useLocalStorageSet } from '../../../hooks/useLocalStorageSet';
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

export interface UseLayoutPlanViewStateReturn {
  searchQuery: string;
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
  );

  useEffect(() => {
    const previous = prevSearchQueryRef.current;

    if (trimmed.length >= 2) {
      logPerfEvent('search.query', {
        length: trimmed.length,
        resultCount: searchResultCount ?? null,
      });
    } else if (previous && !trimmed) {
      logPerfEvent('search.clear', { prevLength: previous.length });
    }

  const clearSelectedItemIds = useCallback(() => {
    setSelectedItemIds(new Set());
  }, []);

  return {
    searchQuery,
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
