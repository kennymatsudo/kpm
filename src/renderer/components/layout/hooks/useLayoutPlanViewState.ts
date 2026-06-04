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

export interface PersonFilterOption {
  key: string;
  role: 'assignee' | 'creator';
  id: string;
  name: string;
  avatarUrl: string | null;
  count: number;
}

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
  selectedPeopleFilterKeys: Set<string>;
  setSelectedPeopleFilterKeys: (keys: Set<string>) => void;
  personFilterOptions: PersonFilterOption[];
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
  const [selectedPeopleFilterKeys, setSelectedPeopleFilterKeys] = useLocalStorageSet<string>(
    currentProjectId ? `kpm-people-filter-${currentProjectId}` : null
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
  const personFilterOptions = useMemo<PersonFilterOption[]>(() => {
    const options = new Map<string, PersonFilterOption>();
    for (const item of plannedItems) {
      if (item.external_assignee_id && item.external_assignee_name) {
        const key = `assignee:${item.external_assignee_id}`;
        const existing = options.get(key);
        if (existing) existing.count++;
        else options.set(key, {
          key,
          role: 'assignee',
          id: item.external_assignee_id,
          name: item.external_assignee_name,
          avatarUrl: item.external_assignee_avatar_url ?? null,
          count: 1,
        });
      } else if (item.external_key) {
        const key = 'assignee:__unassigned__';
        const existing = options.get(key);
        if (existing) existing.count++;
        else options.set(key, { key, role: 'assignee', id: '__unassigned__', name: 'Unassigned', avatarUrl: null, count: 1 });
      }
      if (item.external_creator_id && item.external_creator_name) {
        const key = `creator:${item.external_creator_id}`;
        const existing = options.get(key);
        if (existing) existing.count++;
        else options.set(key, {
          key,
          role: 'creator',
          id: item.external_creator_id,
          name: item.external_creator_name,
          avatarUrl: item.external_creator_avatar_url ?? null,
          count: 1,
        });
      }
    }
    return Array.from(options.values()).sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
  }, [plannedItems]);

  const filteredPlannedItems = useMemo(
    () => selectFilteredPlannedItems(planItems, hiddenStatusCategories, selectedPeopleFilterKeys),
    [planItems, hiddenStatusCategories, selectedPeopleFilterKeys]
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
    selectedPeopleFilterKeys,
    setSelectedPeopleFilterKeys,
    personFilterOptions,
    selectedItemIds,
    setSelectedItemIds,
    clearSelectedItemIds,
    filteredPlannedItems,
    statusCounts,
    searchResultCount,
  };
}
