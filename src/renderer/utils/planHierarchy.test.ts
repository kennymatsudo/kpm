import { describe, it, expect } from 'vitest';
import { sortGroupItems } from './planHierarchy';
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
