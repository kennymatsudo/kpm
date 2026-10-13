import { useEffect, useMemo, useRef } from 'react';
import type { PlanItem } from '../../../../shared/types';
import { selectPlanSearchResultCount, usePlanViewStore } from '../../../stores';
import { logPerfEvent } from '../../../utils/perfLogger';

/** How many of `filteredPlannedItems` match the debounced search, logging query and clear events. */
export function usePlanSearchResultCount(filteredPlannedItems: PlanItem[]): number | undefined {
  const debouncedSearchQuery = usePlanViewStore((state) => state.debouncedSearchQuery);
  const prevSearchQueryRef = useRef('');

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

  return searchResultCount;
}
