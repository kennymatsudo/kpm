import { describe, it, expect } from 'vitest';
import { sortGroupItems, calculateCardHeight, buildHeightMapFromTree, type TreeNode } from './planHierarchy';
import type { PlanItem } from '../../shared/types';

/** Create a minimal PlanItem for testing */
function createTestItem(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: overrides.id ?? 'item-1',
    project_id: 'project-1',
    parent_id: null,
    title: 'Test Item',
    description: null,
    label: 'task',
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
    sync_source: 'local',
    last_synced_at: null,
    intent: null,
    acceptance_criteria: null,
    source_document_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('sortGroupItems', () => {
  it('sorts by status_category priority', () => {
    const items = [
      createTestItem({ id: 'done', status_category: 'done' }),
      createTestItem({ id: 'in_progress', status_category: 'in_progress' }),
      createTestItem({ id: 'canceled', status_category: 'canceled' }),
      createTestItem({ id: 'blocked', status_category: 'blocked' }),
      createTestItem({ id: 'not_started', status_category: 'not_started' }),
    ];

    const sorted = sortGroupItems(items);

    expect(sorted.map(i => i.id)).toEqual([
      'in_progress',
      'blocked',
      'not_started',
      'done',
      'canceled',
    ]);
  });

  it('treats null status_category as not_started', () => {
    const items = [
      createTestItem({ id: 'done', status_category: 'done' }),
      createTestItem({ id: 'null-status', status_category: null }),
      createTestItem({ id: 'in_progress', status_category: 'in_progress' }),
    ];

    const sorted = sortGroupItems(items);

    expect(sorted.map(i => i.id)).toEqual([
      'in_progress',
      'null-status',
      'done',
    ]);
  });

  it('sorts unsynced items before synced within same status', () => {
    const items = [
      createTestItem({
        id: 'synced',
        status_category: 'in_progress',
        external_key: 'EXT-123',
      }),
      createTestItem({
        id: 'unsynced',
        status_category: 'in_progress',
        external_key: null,
      }),
    ];

    const sorted = sortGroupItems(items);

    expect(sorted.map(i => i.id)).toEqual(['unsynced', 'synced']);
  });

  it('sorts by most recently updated within same status and sync state', () => {
    const items = [
      createTestItem({
        id: 'older',
        status_category: 'in_progress',
        updated_at: '2024-01-01T10:00:00Z',
      }),
      createTestItem({
        id: 'newest',
        status_category: 'in_progress',
        updated_at: '2024-01-03T10:00:00Z',
      }),
      createTestItem({
        id: 'middle',
        status_category: 'in_progress',
        updated_at: '2024-01-02T10:00:00Z',
      }),
    ];

    const sorted = sortGroupItems(items);

    expect(sorted.map(i => i.id)).toEqual(['newest', 'middle', 'older']);
  });

  it('falls back to created_at when updated_at is undefined', () => {
    const items = [
      createTestItem({
        id: 'older',
        status_category: 'in_progress',
        updated_at: undefined,
        created_at: '2024-01-01T10:00:00Z',
      }),
      createTestItem({
        id: 'newer',
        status_category: 'in_progress',
        updated_at: undefined,
        created_at: '2024-01-02T10:00:00Z',
      }),
    ];

    const sorted = sortGroupItems(items);

    expect(sorted.map(i => i.id)).toEqual(['newer', 'older']);
  });

  it('does not mutate the original array', () => {
    const items = [
      createTestItem({ id: 'done', status_category: 'done' }),
      createTestItem({ id: 'in_progress', status_category: 'in_progress' }),
    ];
    const originalOrder = items.map(i => i.id);

    sortGroupItems(items);

    expect(items.map(i => i.id)).toEqual(originalOrder);
  });

  it('applies all sort criteria in correct order', () => {
    const items = [
      createTestItem({
        id: 'done-synced',
        status_category: 'done',
        external_key: 'EXT-1',
        updated_at: '2024-01-10T00:00:00Z',
      }),
      createTestItem({
        id: 'in_progress-unsynced-old',
        status_category: 'in_progress',
        external_key: null,
        updated_at: '2024-01-01T00:00:00Z',
      }),
      createTestItem({
        id: 'in_progress-synced-new',
        status_category: 'in_progress',
        external_key: 'EXT-2',
        updated_at: '2024-01-05T00:00:00Z',
      }),
      createTestItem({
        id: 'in_progress-unsynced-new',
        status_category: 'in_progress',
        external_key: null,
        updated_at: '2024-01-03T00:00:00Z',
      }),
      createTestItem({
        id: 'blocked-unsynced',
        status_category: 'blocked',
        external_key: null,
        updated_at: '2024-01-08T00:00:00Z',
      }),
    ];

    const sorted = sortGroupItems(items);

    expect(sorted.map(i => i.id)).toEqual([
      'in_progress-unsynced-new',  // in_progress + unsynced + newer
      'in_progress-unsynced-old',  // in_progress + unsynced + older
      'in_progress-synced-new',    // in_progress + synced
      'blocked-unsynced',          // blocked
      'done-synced',               // done
    ]);
  });

  it('handles empty array', () => {
    const sorted = sortGroupItems([]);
    expect(sorted).toEqual([]);
  });

  it('handles single item', () => {
    const items = [createTestItem({ id: 'only-one' })];
    const sorted = sortGroupItems(items);
    expect(sorted.map(i => i.id)).toEqual(['only-one']);
  });
});

function toTreeNode(item: PlanItem, children: TreeNode[] = []): TreeNode {
  return { ...item, children };
}

describe('calculateCardHeight', () => {
  it('depth 0 leaf card is 87px (padding 16 + title 21 + metadata 26 + description 24)', () => {
    const itemMap = new Map<string, PlanItem>([['a', createTestItem({ id: 'a' })]]);
    const childrenMap = new Map<string, string[]>();

    expect(calculateCardHeight('a', childrenMap, itemMap, 0)).toBe(87);
  });

  it('depth 1 leaf card is 84px (padding 16 + title 18 + metadata 26 + description 24)', () => {
    const itemMap = new Map<string, PlanItem>([['a', createTestItem({ id: 'a' })]]);
    const childrenMap = new Map<string, string[]>();

    expect(calculateCardHeight('a', childrenMap, itemMap, 1)).toBe(84);
  });

  it('depth 2 leaf card is 56px (padding 12 + title 18 + metadata 26, no description)', () => {
    const itemMap = new Map<string, PlanItem>([['a', createTestItem({ id: 'a' })]]);
    const childrenMap = new Map<string, string[]>();

    expect(calculateCardHeight('a', childrenMap, itemMap, 2)).toBe(56);
  });

  it('depth 3 and depth 4 leaf cards are also 56px (same as depth 2)', () => {
    const itemMap = new Map<string, PlanItem>([['a', createTestItem({ id: 'a' })]]);
    const childrenMap = new Map<string, string[]>();

    expect(calculateCardHeight('a', childrenMap, itemMap, 3)).toBe(56);
    expect(calculateCardHeight('a', childrenMap, itemMap, 4)).toBe(56);
  });

  it('height does not depend on presence of description text (space always reserved at depth <= 1)', () => {
    const itemMap = new Map<string, PlanItem>([
      ['with-desc', createTestItem({ id: 'with-desc', description: 'Has a description' })],
      ['without-desc', createTestItem({ id: 'without-desc', description: null })],
    ]);
    const childrenMap = new Map<string, string[]>();

    expect(calculateCardHeight('with-desc', childrenMap, itemMap, 0)).toBe(87);
    expect(calculateCardHeight('without-desc', childrenMap, itemMap, 0)).toBe(87);
  });

  it('single child adds mt-1.5 (6) + toggle (16) + child height, no space-y-2 for first child', () => {
    const itemMap = new Map<string, PlanItem>([
      ['parent', createTestItem({ id: 'parent' })],
      ['child', createTestItem({ id: 'child' })],
    ]);
    const childrenMap = new Map<string, string[]>([['parent', ['child']]]);

    // parent (depth 0, 87) + 6 + 16 + child (depth 1, 84) = 193
    expect(calculateCardHeight('parent', childrenMap, itemMap, 0)).toBe(193);
  });

  it('multiple children add space-y-2 (8) gaps between them but not before the first', () => {
    const itemMap = new Map<string, PlanItem>([
      ['parent', createTestItem({ id: 'parent' })],
      ['child-1', createTestItem({ id: 'child-1' })],
      ['child-2', createTestItem({ id: 'child-2' })],
      ['child-3', createTestItem({ id: 'child-3' })],
    ]);
    const childrenMap = new Map<string, string[]>([
      ['parent', ['child-1', 'child-2', 'child-3']],
    ]);

    // parent (87) + 6 + 16 + 3 * child(depth1, 84) + 2 * space-y-2(8) = 87 + 22 + 252 + 16 = 377
    expect(calculateCardHeight('parent', childrenMap, itemMap, 0)).toBe(377);
  });

  it('nested grandchildren accumulate through recursive depth', () => {
    const itemMap = new Map<string, PlanItem>([
      ['root', createTestItem({ id: 'root' })],
      ['mid', createTestItem({ id: 'mid' })],
      ['leaf', createTestItem({ id: 'leaf' })],
    ]);
    const childrenMap = new Map<string, string[]>([
      ['root', ['mid']],
      ['mid', ['leaf']],
    ]);

    // leaf @ depth 2 = 56
    // mid @ depth 1 = 84 + 6 + 16 + 56 = 162
    // root @ depth 0 = 87 + 6 + 16 + 162 = 271
    expect(calculateCardHeight('root', childrenMap, itemMap, 0)).toBe(271);
  });
});

describe('buildHeightMapFromTree', () => {
  it('matches calculateCardHeight for an equivalent tree, depth 0/1/2', () => {
    const leaf = toTreeNode(createTestItem({ id: 'leaf' }));
    const mid = toTreeNode(createTestItem({ id: 'mid' }), [leaf]);
    const root = toTreeNode(createTestItem({ id: 'root' }), [mid]);

    const heightMap = buildHeightMapFromTree([root]);

    const itemMap = new Map<string, PlanItem>([
      ['root', createTestItem({ id: 'root' })],
      ['mid', createTestItem({ id: 'mid' })],
      ['leaf', createTestItem({ id: 'leaf' })],
    ]);
    const childrenMap = new Map<string, string[]>([
      ['root', ['mid']],
      ['mid', ['leaf']],
    ]);

    expect(heightMap.get('root')).toBe(calculateCardHeight('root', childrenMap, itemMap, 0));
    expect(heightMap.get('mid')).toBe(calculateCardHeight('mid', childrenMap, itemMap, 1));
    expect(heightMap.get('leaf')).toBe(calculateCardHeight('leaf', childrenMap, itemMap, 2));
  });

  it('computes heights for multiple root nodes with several children each', () => {
    const childA1 = toTreeNode(createTestItem({ id: 'a1' }));
    const childA2 = toTreeNode(createTestItem({ id: 'a2' }));
    const rootA = toTreeNode(createTestItem({ id: 'rootA' }), [childA1, childA2]);
    const rootB = toTreeNode(createTestItem({ id: 'rootB' }));

    const heightMap = buildHeightMapFromTree([rootA, rootB]);

    // rootA (87) + 6 + 16 + a1(84) + a2(84) + space-y-2(8) = 87 + 22 + 168 + 8 = 285
    expect(heightMap.get('rootA')).toBe(285);
    expect(heightMap.get('rootB')).toBe(87);
    expect(heightMap.get('a1')).toBe(84);
    expect(heightMap.get('a2')).toBe(84);
  });

  it('collapsed vs expanded state does not affect the computed height (toggle is always counted when children exist)', () => {
    const child = toTreeNode(createTestItem({ id: 'child' }));
    const parentWithChildren = toTreeNode(createTestItem({ id: 'parent' }), [child]);

    const heightMap = buildHeightMapFromTree([parentWithChildren]);

    // Height calc doesn't model expand/collapse UI state; it always reserves
    // space for the toggle row when children.length > 0.
    expect(heightMap.get('parent')).toBe(193);
  });
});
