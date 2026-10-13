import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import type { PlanItem, StatusCategory } from '../../../../shared/types';
import { useLocalStorageSet } from '../../../hooks/useLocalStorageSet';
import {
  selectFilteredPlannedItems,
  selectNormalizedPlanItems,
  usePlanViewStore,
} from '../../../stores';

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

export interface UseLayoutPlanViewStateReturn {
  hiddenStatusCategories: Set<StatusCategory>;
  hiddenStatusCategoriesRef: MutableRefObject<Set<StatusCategory>>;
  setHiddenStatusCategories: (categories: Set<StatusCategory>) => void;
  selectedPeopleFilterKeys: Set<string>;
  setSelectedPeopleFilterKeys: (keys: Set<string>) => void;
  personFilterOptions: PersonFilterOption[];
  filteredPlannedItems: PlanItem[];
  statusCounts: StatusCounts;
}

export function useLayoutPlanViewState(
  currentProjectId: string | null,
  planItems: PlanItem[]
): UseLayoutPlanViewStateReturn {
  const [hiddenStatusCategories, setHiddenStatusCategories] = useLocalStorageSet<StatusCategory>(
    currentProjectId ? `kpm-status-filter-${currentProjectId}` : null
  );
  const [selectedPeopleFilterKeys, setSelectedPeopleFilterKeys] = useLocalStorageSet<string>(
    currentProjectId ? `kpm-people-filter-${currentProjectId}` : null
  );
  const hiddenStatusCategoriesRef = useRef(hiddenStatusCategories);

  useEffect(() => {
    usePlanViewStore.getState().reset();
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

  return {
    hiddenStatusCategories,
    hiddenStatusCategoriesRef,
    setHiddenStatusCategories,
    selectedPeopleFilterKeys,
    setSelectedPeopleFilterKeys,
    personFilterOptions,
    filteredPlannedItems,
    statusCounts,
  };
}
