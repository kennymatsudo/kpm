import { describe, expect, it } from 'vitest';
import type { PlanItem, OutboundChange, SyncReviewItem } from '../../../../shared/types';
import {
  buildItemMap,
  buildItemTree,
  selectCheckedItems,
  selectValidItems,
} from './syncReviewSelectors';

function makePlanItem(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: 'item-1',
    project_id: 'proj-1',
    parent_id: null,
    title: 'Do the thing',
    description: null,
    intent: null,
    acceptance_criteria: null,
    source_document_id: null,
    label: null,
    item_order: 0,
    code_refs: null,
    status: 'planned',
    release_tag: null,
    position_x: null,
    position_y: null,
    group_id: null,
    association_id: null,
    external_key: null,
    external_id: null,
    external_type: null,
    external_issue_type: null,
    external_status: null,
    status_category: null,
    external_url: null,
    external_parent_key: null,
    external_epic_key: null,
    external_assignee_id: null,
    external_assignee_name: null,
    external_assignee_avatar_url: null,
    external_creator_id: null,
    external_creator_name: null,
    external_creator_avatar_url: null,
    sync_source: 'local',
    last_synced_at: null,
    completed_at: null,
    ...overrides,
  };
}

function makeQueueEntry(overrides: Partial<OutboundChange> = {}): OutboundChange {
  return {
    id: 'queue-1',
    kpm_project_id: 'proj-1',
    plan_item_id: 'item-1',
    association_id: 'assoc-1',
    operation: 'create',
    target_issue_type_id: null,
    target_issue_type_name: null,
    target_parent_key: null,
    target_status_category: null,
    custom_field_overrides: null,
    queued_by: 'user',
    queued_at: '2026-01-01T00:00:00Z',
    error_message: null,
    external_key: null,
    external_id: null,
    tracker_type: null,
    ...overrides,
  };
}

function makeReviewItem(overrides: Partial<SyncReviewItem> = {}): SyncReviewItem {
  const planItemOverrides = overrides.planItem;
  const queueEntryOverrides = overrides.queueEntry;
  return {
    queueEntry: makeQueueEntry(queueEntryOverrides),
    planItem: makePlanItem(planItemOverrides),
    resolvedType: null,
    resolvedParent: null,
    resolvedDescription: null,
    validationErrors: [],
    jiraCurrent: null,
    diffs: null,
    statusTransition: null,
    decision: 'pending',
    hasConflict: false,
    ...overrides,
  };
}

describe('buildItemMap', () => {
  it('maps each item by its plan item id', () => {
    const a = makeReviewItem({ planItem: makePlanItem({ id: 'a' }) });
    const b = makeReviewItem({ planItem: makePlanItem({ id: 'b' }) });

    const map = buildItemMap([a, b]);

    expect(map.size).toBe(2);
    expect(map.get('a')).toBe(a);
    expect(map.get('b')).toBe(b);
  });

  it('returns an empty map for an empty list', () => {
    expect(buildItemMap([]).size).toBe(0);
  });
});

describe('selectValidItems', () => {
  it('keeps only items with no validation errors', () => {
    const valid = makeReviewItem({ planItem: makePlanItem({ id: 'valid' }), validationErrors: [] });
    const invalid = makeReviewItem({ planItem: makePlanItem({ id: 'invalid' }), validationErrors: ['Missing title'] });

    expect(selectValidItems([valid, invalid])).toEqual([valid]);
  });

  it('returns an empty array when every item has validation errors', () => {
    const invalid = makeReviewItem({ validationErrors: ['bad'] });
    expect(selectValidItems([invalid])).toEqual([]);
  });
});

describe('selectCheckedItems', () => {
  it('keeps only items with an approved decision', () => {
    const approved = makeReviewItem({ planItem: makePlanItem({ id: 'approved' }), decision: 'approved' });
    const pending = makeReviewItem({ planItem: makePlanItem({ id: 'pending' }), decision: 'pending' });
    const skipped = makeReviewItem({ planItem: makePlanItem({ id: 'skipped' }), decision: 'skipped' });
    const removed = makeReviewItem({ planItem: makePlanItem({ id: 'removed' }), decision: 'removed' });

    expect(selectCheckedItems([approved, pending, skipped, removed])).toEqual([approved]);
  });
});

describe('buildItemTree', () => {
  it('nests a child under its parent when the parent is in the queue', () => {
    const parent = makeReviewItem({ planItem: makePlanItem({ id: 'parent', parent_id: null }) });
    const child = makeReviewItem({ planItem: makePlanItem({ id: 'child', parent_id: 'parent' }) });

    const tree = buildItemTree([parent, child]);

    expect(tree.roots).toEqual([parent]);
    expect(tree.childrenOf.get('parent')).toEqual([child]);
    expect(tree.childrenOf.get(null)).toEqual([parent]);
  });

  it('treats a child whose parent is not in the queue as an orphan root', () => {
    const orphanChild = makeReviewItem({
      planItem: makePlanItem({ id: 'orphan-child', parent_id: 'missing-parent' }),
    });

    const tree = buildItemTree([orphanChild]);

    expect(tree.roots).toEqual([orphanChild]);
    expect(tree.childrenOf.get(null)).toEqual([orphanChild]);
    expect(tree.childrenOf.has('missing-parent')).toBe(false);
  });

  it('places items with no parent_id at the root', () => {
    const root = makeReviewItem({ planItem: makePlanItem({ id: 'root', parent_id: null }) });

    const tree = buildItemTree([root]);

    expect(tree.roots).toEqual([root]);
  });

  it('preserves queue order among siblings', () => {
    const parent = makeReviewItem({ planItem: makePlanItem({ id: 'parent', parent_id: null }) });
    const firstChild = makeReviewItem({ planItem: makePlanItem({ id: 'first', parent_id: 'parent' }) });
    const secondChild = makeReviewItem({ planItem: makePlanItem({ id: 'second', parent_id: 'parent' }) });

    const tree = buildItemTree([parent, firstChild, secondChild]);

    expect(tree.childrenOf.get('parent')).toEqual([firstChild, secondChild]);
  });

  it('returns empty roots and an empty map for an empty queue', () => {
    const tree = buildItemTree([]);
    expect(tree.roots).toEqual([]);
    expect(tree.childrenOf.size).toBe(0);
  });
});
