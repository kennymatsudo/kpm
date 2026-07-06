import type { SyncReviewItem } from '../../../../shared/types';

/** Parent/child nesting for the sync review sidebar; items whose parent isn't in the queue become roots. */
export interface SyncReviewItemTree {
  roots: SyncReviewItem[];
  childrenOf: Map<string | null, SyncReviewItem[]>;
}

export function buildItemMap(items: SyncReviewItem[]): Map<string, SyncReviewItem> {
  const map = new Map<string, SyncReviewItem>();
  for (const item of items) map.set(item.planItem.id, item);
  return map;
}

export function selectValidItems(items: SyncReviewItem[]): SyncReviewItem[] {
  return items.filter((item) => item.validationErrors.length === 0);
}

export function selectCheckedItems(items: SyncReviewItem[]): SyncReviewItem[] {
  return items.filter((item) => item.decision === 'approved');
}

export function buildItemTree(items: SyncReviewItem[]): SyncReviewItemTree {
  const itemIds = new Set(items.map((item) => item.planItem.id));
  const childrenOf = new Map<string | null, SyncReviewItem[]>();

  for (const item of items) {
    const parentKey = item.planItem.parent_id && itemIds.has(item.planItem.parent_id)
      ? item.planItem.parent_id
      : null;
    const siblings = childrenOf.get(parentKey) ?? [];
    siblings.push(item);
    childrenOf.set(parentKey, siblings);
  }

  return { roots: childrenOf.get(null) ?? [], childrenOf };
}
