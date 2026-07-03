import { describe, expect, it, vi } from 'vitest';
import {
  resolveOperation,
  applyAutoQueue,
  queueForTracker,
} from './SyncQueuePolicy';
import type { TrackerAssociationWithScope } from '../../../shared/types';

function makeAssociation(id: string): TrackerAssociationWithScope {
  return {
    id,
    kpm_project_id: 'project-1',
    scope_id: 'scope-1',
    jql_filter: '',
    display_name: null,
    status_mapping: null,
    custom_field_values: null,
    epic_key: null,
    last_synced_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    tracker_type: 'jira',
    project_key: 'PROJ',
    project_name: null,
    site_url: 'example.atlassian.net',
  };
}

describe('resolveOperation', () => {
  it('resolves update for items with an external_key', () => {
    expect(resolveOperation({ external_key: 'PROJ-1' })).toBe('update');
  });

  it('resolves create for items without an external_key', () => {
    expect(resolveOperation({ external_key: null })).toBe('create');
  });
});

describe('applyAutoQueue', () => {
  function makeSyncQueue(overrides: Partial<{ getByItemId: unknown; updateStatusCategory: unknown; add: unknown }> = {}) {
    return {
      getByItemId: vi.fn().mockReturnValue(undefined),
      updateStatusCategory: vi.fn(),
      add: vi.fn(),
      ...overrides,
    };
  }

  it('queues an update for a linked item when an exportable field changes', () => {
    const syncQueue = makeSyncQueue();
    const tracker = { getAssociationsByProject: vi.fn() };

    applyAutoQueue(
      {
        id: 'item-1',
        project_id: 'project-1',
        external_key: 'PROJ-1',
        association_id: 'assoc-1',
        status_category: 'in_progress',
      },
      { title: 'New title' },
      'user',
      { syncQueue, tracker } as never
    );

    expect(syncQueue.add).toHaveBeenCalledWith(
      expect.objectContaining({
        kpm_project_id: 'project-1',
        plan_item_id: 'item-1',
        association_id: 'assoc-1',
        operation: 'update',
        queued_by: 'user',
      })
    );
  });

  it('does not auto-queue a new item for create when the project has zero associations', () => {
    const syncQueue = makeSyncQueue();
    const tracker = { getAssociationsByProject: vi.fn().mockReturnValue([]) };

    applyAutoQueue(
      { id: 'item-1', project_id: 'project-1', external_key: null, association_id: null, status_category: null },
      { status_category: 'not_started' },
      'user',
      { syncQueue, tracker } as never
    );

    expect(syncQueue.add).not.toHaveBeenCalled();
  });

  it('auto-queues a new item for create when the project has exactly one association', () => {
    const syncQueue = makeSyncQueue();
    const association = makeAssociation('assoc-1');
    const tracker = { getAssociationsByProject: vi.fn().mockReturnValue([association]) };

    applyAutoQueue(
      { id: 'item-1', project_id: 'project-1', external_key: null, association_id: null, status_category: null },
      { status_category: 'not_started' },
      'claude',
      { syncQueue, tracker } as never
    );

    expect(syncQueue.add).toHaveBeenCalledWith(
      expect.objectContaining({
        association_id: 'assoc-1',
        operation: 'create',
        queued_by: 'claude',
        target_status_category: 'not_started',
      })
    );
  });

  it('does not auto-queue a new item for create when the project has multiple associations', () => {
    const syncQueue = makeSyncQueue();
    const tracker = {
      getAssociationsByProject: vi.fn().mockReturnValue([makeAssociation('assoc-1'), makeAssociation('assoc-2')]),
    };

    applyAutoQueue(
      { id: 'item-1', project_id: 'project-1', external_key: null, association_id: null, status_category: null },
      { status_category: 'not_started' },
      'user',
      { syncQueue, tracker } as never
    );

    expect(syncQueue.add).not.toHaveBeenCalled();
  });

  it('updates the queued status target when the item is already queued and a status is set', () => {
    const syncQueue = makeSyncQueue({ getByItemId: vi.fn().mockReturnValue({ id: 'queue-1' }) });
    const tracker = { getAssociationsByProject: vi.fn() };

    applyAutoQueue(
      {
        id: 'item-1',
        project_id: 'project-1',
        external_key: 'PROJ-1',
        association_id: 'assoc-1',
        status_category: 'in_progress',
      },
      { status_category: 'done' },
      'user',
      { syncQueue, tracker } as never
    );

    expect(syncQueue.updateStatusCategory).toHaveBeenCalledWith('queue-1', 'done');
    expect(syncQueue.add).not.toHaveBeenCalled();
  });

  it('leaves an already-queued entry alone when no status is being set', () => {
    const syncQueue = makeSyncQueue({ getByItemId: vi.fn().mockReturnValue({ id: 'queue-1' }) });
    const tracker = { getAssociationsByProject: vi.fn() };

    applyAutoQueue(
      {
        id: 'item-1',
        project_id: 'project-1',
        external_key: 'PROJ-1',
        association_id: 'assoc-1',
        status_category: 'in_progress',
      },
      { title: 'New title' },
      'user',
      { syncQueue, tracker } as never
    );

    expect(syncQueue.updateStatusCategory).not.toHaveBeenCalled();
    expect(syncQueue.add).not.toHaveBeenCalled();
  });
});

describe('queueForTracker', () => {
  function makeItem(overrides: Partial<{ id: string; external_key: string | null; status_category: string | null }> = {}) {
    return {
      id: 'item-1',
      external_key: null,
      status_category: 'not_started',
      ...overrides,
    };
  }

  it('uses the first association when multiple exist', () => {
    const syncQueue = { add: vi.fn(), updateStatusCategory: vi.fn() };
    const associations = [makeAssociation('assoc-1'), makeAssociation('assoc-2')];

    const result = queueForTracker({
      projectId: 'project-1',
      itemIds: ['item-1'],
      queuedBy: 'claude',
      associations,
      alreadyQueuedItemIds: new Map(),
      getItem: () => makeItem({ id: 'item-1' }),
      syncQueue,
    });

    expect(syncQueue.add).toHaveBeenCalledWith(
      expect.objectContaining({ association_id: 'assoc-1' })
    );
    expect(result.queuedCount).toBe(1);
  });

  it('derives create vs update per item from external_key', () => {
    const syncQueue = { add: vi.fn(), updateStatusCategory: vi.fn() };
    const items = new Map([
      ['item-1', makeItem({ id: 'item-1', external_key: null })],
      ['item-2', makeItem({ id: 'item-2', external_key: 'PROJ-9' })],
    ]);

    queueForTracker({
      projectId: 'project-1',
      itemIds: ['item-1', 'item-2'],
      queuedBy: 'claude',
      associations: [makeAssociation('assoc-1')],
      alreadyQueuedItemIds: new Map(),
      getItem: (id) => items.get(id),
      syncQueue,
    });

    expect(syncQueue.add).toHaveBeenCalledWith(expect.objectContaining({ plan_item_id: 'item-1', operation: 'create' }));
    expect(syncQueue.add).toHaveBeenCalledWith(expect.objectContaining({ plan_item_id: 'item-2', operation: 'update' }));
  });

  it('adds one entry for an item that is not already queued', () => {
    const syncQueue = { add: vi.fn(), updateStatusCategory: vi.fn() };

    const result = queueForTracker({
      projectId: 'project-1',
      itemIds: ['item-1'],
      queuedBy: 'claude',
      associations: [makeAssociation('assoc-1')],
      alreadyQueuedItemIds: new Map(),
      getItem: () => makeItem({ id: 'item-1' }),
      syncQueue,
    });

    expect(syncQueue.add).toHaveBeenCalledTimes(1);
    expect(result.queuedCount).toBe(1);
  });

  it('refreshes the status target instead of skipping when the item is already queued', () => {
    const syncQueue = { add: vi.fn(), updateStatusCategory: vi.fn() };

    const result = queueForTracker({
      projectId: 'project-1',
      itemIds: ['item-1'],
      queuedBy: 'claude',
      associations: [makeAssociation('assoc-1')],
      alreadyQueuedItemIds: new Map([['item-1', 'queue-1']]),
      getItem: () => makeItem({ id: 'item-1', status_category: 'done' }),
      syncQueue,
    });

    expect(syncQueue.add).not.toHaveBeenCalled();
    expect(syncQueue.updateStatusCategory).toHaveBeenCalledWith('queue-1', 'done');
    expect(result.queuedCount).toBe(0);
  });

  it('skips adding when no tracker association is configured for the project', () => {
    const syncQueue = { add: vi.fn(), updateStatusCategory: vi.fn() };

    const result = queueForTracker({
      projectId: 'project-1',
      itemIds: ['item-1'],
      queuedBy: 'claude',
      associations: [],
      alreadyQueuedItemIds: new Map(),
      getItem: () => makeItem({ id: 'item-1' }),
      syncQueue,
    });

    expect(syncQueue.add).not.toHaveBeenCalled();
    expect(result.queuedCount).toBe(0);
    expect(result.skippedReason).toBe('no_association');
  });
});
