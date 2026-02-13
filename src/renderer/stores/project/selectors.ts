import { getStatusCategory } from '../../constants/statusConfig';
import type { ProjectDomainState } from './types';

export const selectProjectSummary = (state: ProjectDomainState) => ({
  projects: state.projects,
  currentProjectId: state.currentProjectId,
});

const ROOT_PARENT_ID = '__root__';

export interface NormalizedPlanItems {
  byId: Map<string, PlanItem>;
  childrenByParentId: Map<string, PlanItem[]>;
  plannedItems: PlanItem[];
}

const normalizedPlanItemsCache = new WeakMap<readonly PlanItem[], NormalizedPlanItems>();

/**
 * Build normalized plan structures once per planItems reference.
 */
export function selectNormalizedPlanItems(planItems: readonly PlanItem[]): NormalizedPlanItems {
  const cached = normalizedPlanItemsCache.get(planItems);
  if (cached) return cached;

  const byId = new Map<string, PlanItem>();
  const childrenByParentId = new Map<string, PlanItem[]>();
  const plannedItems: PlanItem[] = [];

  for (const item of planItems) {
    byId.set(item.id, item);

    const parentKey = item.parent_id ?? ROOT_PARENT_ID;
    const siblings = childrenByParentId.get(parentKey);
    if (siblings) {
      siblings.push(item);
    } else {
      childrenByParentId.set(parentKey, [item]);
    }

    if (item.status === 'planned') {
      plannedItems.push(item);
    }
  }

  const normalized = { byId, childrenByParentId, plannedItems };
  normalizedPlanItemsCache.set(planItems, normalized);
  return normalized;
}

const filteredPlannedItemsCache = new WeakMap<readonly PlanItem[], WeakMap<ReadonlySet<StatusCategory>, PlanItem[]>>();

export function selectFilteredPlannedItems(
  planItems: readonly PlanItem[],
): PlanItem[] {
  const { plannedItems } = selectNormalizedPlanItems(planItems);

  let cacheForPlanItems = filteredPlannedItemsCache.get(planItems);
  if (!cacheForPlanItems) {
    cacheForPlanItems = new WeakMap<ReadonlySet<StatusCategory>, PlanItem[]>();
    filteredPlannedItemsCache.set(planItems, cacheForPlanItems);
  }


  const filtered = plannedItems.filter((item) => {
    const effectiveStatus = item.status_category ?? getStatusCategory(item.external_status, item.external_type);
  });
  return filtered;
}

const searchResultCountCache = new WeakMap<readonly PlanItem[], Map<string, number>>();

export function selectPlanSearchResultCount(
  items: readonly PlanItem[],
  searchQuery: string
): number | undefined {
  const trimmedQuery = searchQuery.trim();
  if (!trimmedQuery) return undefined;

  let cacheForItems = searchResultCountCache.get(items);
  if (!cacheForItems) {
    cacheForItems = new Map<string, number>();
    searchResultCountCache.set(items, cacheForItems);
  }

  const normalizedQuery = trimmedQuery.toLowerCase();
  const cached = cacheForItems.get(normalizedQuery);
  if (cached !== undefined) return cached;

  const count = items.filter(
    (item) => item.title.toLowerCase().includes(normalizedQuery) || item.external_key?.toLowerCase().includes(normalizedQuery)
  ).length;
  cacheForItems.set(normalizedQuery, count);
  return count;
}

export function selectFocusedPlanItemId(focusedResources: readonly FocusedResource[]): string | null {
  const planItemFocus = focusedResources.find((resource) => resource.type === 'plan_item');
  return planItemFocus?.type === 'plan_item' ? planItemFocus.id : null;
}

export function selectDescendantIds(
  planItems: readonly PlanItem[],
  selectedItemIds: ReadonlySet<string>
): Set<string> {
  const { childrenByParentId } = selectNormalizedPlanItems(planItems);
  const descendants = new Set<string>();
  const stack = [...selectedItemIds];

  while (stack.length > 0) {
    const parentId = stack.pop();
    if (!parentId) continue;

    for (const child of childrenByParentId.get(parentId) ?? []) {
      if (selectedItemIds.has(child.id) || descendants.has(child.id)) continue;
      descendants.add(child.id);
      stack.push(child.id);
    }
  }

  return descendants;
}
