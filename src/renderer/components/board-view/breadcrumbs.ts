import type { PlanItem } from '../../../shared/types';
import type { Breadcrumb } from './BoardCard';

/** Shared by every card with no ancestors, so those cards see an equal prop. */
export const EMPTY_BREADCRUMB: Breadcrumb[] = [];

const MAX_CRUMBS = 3;

/** Walks up the parent chain (up to three ancestors), nearest parent last. */
export function buildBreadcrumb(item: PlanItem, parentMap: ReadonlyMap<string, PlanItem>): Breadcrumb[] {
  const chain: Breadcrumb[] = [];
  let currentId = item.parent_id;

  while (currentId && chain.length < MAX_CRUMBS) {
    const parent = parentMap.get(currentId);
    if (!parent) break;
    chain.unshift({
      title: parent.title,
      externalKey: parent.external_key ?? undefined,
    });
    currentId = parent.parent_id;
  }

  return chain.length === 0 ? EMPTY_BREADCRUMB : chain;
}

function sameBreadcrumb(a: readonly Breadcrumb[], b: readonly Breadcrumb[]): boolean {
  return a.length === b.length && a.every((crumb, i) => crumb.title === b[i].title && crumb.externalKey === b[i].externalKey);
}

/**
 * Breadcrumbs for a column's top-level items, keyed by item id. An item whose
 * crumbs are unchanged keeps its previous array, so a rebuilt parent map does
 * not make every card look changed.
 */
export function buildColumnBreadcrumbs(
  roots: readonly { item: PlanItem }[],
  parentMap: ReadonlyMap<string, PlanItem>,
  previous: ReadonlyMap<string, Breadcrumb[]>,
): Map<string, Breadcrumb[]> {
  const next = new Map<string, Breadcrumb[]>();
  for (const { item } of roots) {
    const crumbs = buildBreadcrumb(item, parentMap);
    const prior = previous.get(item.id);
    next.set(item.id, prior && sameBreadcrumb(prior, crumbs) ? prior : crumbs);
  }
  return next;
}
