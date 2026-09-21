import { describe, expect, it, vi } from 'vitest';
import {
  resolveOperation,
  applyAutoQueue,
  admitExplicitQueue,
  queueTrackerDeletionIfNeeded,
} from './OutboundChangePolicy';
import type { TrackerAssociationWithScope } from '../../../shared/types';

function makeAssociation(id: string): TrackerAssociationWithScope {
  return {
    id,
    kpm_project_id: 'project-1',
    scope_id: 'scope-1',
    issue_filter: '',
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
  function makeOutboundChanges(overrides: Partial<{ getByPlanItem: unknown; updateStatusCategory: unknown; add: unknown }> = {}) {
    return {
      getByPlanItem: vi.fn().mockReturnValue(undefined),
      updateStatusCategory: vi.fn(),
      add: vi.fn(),
      ...overrides,
    };
  }

  it('queues an update for a linked item when an exportable field changes', () => {
    const outboundChanges = makeOutboundChanges();
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
      { outboundChanges, tracker } as never
    );

    expect(outboundChanges.add).toHaveBeenCalledWith(
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
    const outboundChanges = makeOutboundChanges();
    const tracker = { getAssociationsByProject: vi.fn().mockReturnValue([]) };

    applyAutoQueue(
      { id: 'item-1', project_id: 'project-1', external_key: null, association_id: null, status_category: null },
      { status_category: 'not_started' },
      'user',
      { outboundChanges, tracker } as never
    );

    expect(outboundChanges.add).not.toHaveBeenCalled();
  });

  it('auto-queues a new item for create when the project has exactly one association', () => {
    const outboundChanges = makeOutboundChanges();
    const association = makeAssociation('assoc-1');
    const tracker = { getAssociationsByProject: vi.fn().mockReturnValue([association]) };

    applyAutoQueue(
      { id: 'item-1', project_id: 'project-1', external_key: null, association_id: null, status_category: null },
      { status_category: 'not_started' },
      'claude',
      { outboundChanges, tracker } as never
    );

    expect(outboundChanges.add).toHaveBeenCalledWith(
      expect.objectContaining({
        association_id: 'assoc-1',
        operation: 'create',
        queued_by: 'claude',
        target_status_category: 'not_started',
      })
    );
  });

  it('does not auto-queue a new item for create when the project has multiple associations', () => {
    const outboundChanges = makeOutboundChanges();
    const tracker = {
      getAssociationsByProject: vi.fn().mockReturnValue([makeAssociation('assoc-1'), makeAssociation('assoc-2')]),
    };

    applyAutoQueue(
      { id: 'item-1', project_id: 'project-1', external_key: null, association_id: null, status_category: null },
      { status_category: 'not_started' },
      'user',
      { outboundChanges, tracker } as never
    );

    expect(outboundChanges.add).not.toHaveBeenCalled();
  });

  it('updates the queued status target when the item is already queued and a status is set', () => {
    const outboundChanges = makeOutboundChanges({ getByPlanItem: vi.fn().mockReturnValue({ id: 'queue-1' }) });
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
      { outboundChanges, tracker } as never
    );

    expect(outboundChanges.updateStatusCategory).toHaveBeenCalledWith('queue-1', 'done');
    expect(outboundChanges.add).not.toHaveBeenCalled();
  });

  it('leaves an already-queued entry alone when no status is being set', () => {
    const outboundChanges = makeOutboundChanges({ getByPlanItem: vi.fn().mockReturnValue({ id: 'queue-1' }) });
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
      { outboundChanges, tracker } as never
    );

    expect(outboundChanges.updateStatusCategory).not.toHaveBeenCalled();
    expect(outboundChanges.add).not.toHaveBeenCalled();
  });
});

describe('admitExplicitQueue', () => {
  function makeItem(overrides: Partial<{ id: string; parent_id: string | null; external_key: string | null; status_category: string | null }> = {}) {
    return {
      id: 'item-1',
      parent_id: null,
      external_key: null,
      status_category: 'not_started',
      ...overrides,
    };
  }

  function makeDeps(items: ReturnType<typeof makeItem>[], staged: { plan_item_id: string; id: string }[] = []) {
    const outboundChanges = {
      add: vi.fn(),
      updateStatusCategory: vi.fn(),
      getByProject: vi.fn(() => staged.map((entry) => ({ ...entry, operation: 'update' }))),
    };
    return {
      outboundChanges,
      deps: { planItems: { getByProject: () => items }, outboundChanges } as never,
    };
  }

  it('derives create vs update per item from external_key', () => {
    const { outboundChanges, deps } = makeDeps([
      makeItem({ id: 'item-1', external_key: null }),
      makeItem({ id: 'item-2', external_key: 'PROJ-9' }),
    ]);

    admitExplicitQueue({
      projectId: 'project-1', itemIds: ['item-1', 'item-2'], associationId: 'assoc-1', queuedBy: 'claude', deps,
    });

    expect(outboundChanges.add).toHaveBeenCalledWith(expect.objectContaining({ plan_item_id: 'item-1', operation: 'create' }));
    expect(outboundChanges.add).toHaveBeenCalledWith(expect.objectContaining({ plan_item_id: 'item-2', operation: 'update' }));
  });

  it('refreshes the status target instead of dropping a repeat request', () => {
    const { outboundChanges, deps } = makeDeps(
      [makeItem({ id: 'item-1', status_category: 'done' })],
      [{ plan_item_id: 'item-1', id: 'queue-1' }],
    );

    const outcome = admitExplicitQueue({
      projectId: 'project-1', itemIds: ['item-1'], associationId: 'assoc-1', queuedBy: 'user', deps,
    });

    expect(outboundChanges.add).not.toHaveBeenCalled();
    expect(outboundChanges.updateStatusCategory).toHaveBeenCalledWith('queue-1', 'done');
    expect(outcome).toEqual({ queued: [], refreshed: ['item-1'], skipped: [] });
  });

  it('queues unsynced ancestors alongside the child, so the export has a parent to point at', () => {
    const { outboundChanges, deps } = makeDeps([
      makeItem({ id: 'epic', parent_id: null, external_key: null }),
      makeItem({ id: 'story', parent_id: 'epic', external_key: null }),
      makeItem({ id: 'task', parent_id: 'story', external_key: null }),
    ]);

    const outcome = admitExplicitQueue({
      projectId: 'project-1', itemIds: ['task'], associationId: 'assoc-1', queuedBy: 'claude', deps,
    });

    expect(outcome.queued.sort()).toEqual(['epic', 'story', 'task']);
    expect(outboundChanges.add).toHaveBeenCalledTimes(3);
  });

  it('leaves an already-exported ancestor alone', () => {
    const { outboundChanges, deps } = makeDeps([
      makeItem({ id: 'epic', external_key: 'PROJ-1' }),
      makeItem({ id: 'task', parent_id: 'epic', external_key: null }),
    ]);

    const outcome = admitExplicitQueue({
      projectId: 'project-1', itemIds: ['task'], associationId: 'assoc-1', queuedBy: 'user', deps,
    });

    expect(outcome.queued).toEqual(['task']);
    expect(outboundChanges.add).toHaveBeenCalledTimes(1);
  });

  it('reports a missing item the caller asked for, and stays quiet about ancestors', () => {
    const { deps } = makeDeps([makeItem({ id: 'item-1' })]);

    const outcome = admitExplicitQueue({
      projectId: 'project-1', itemIds: ['item-1', 'ghost'], associationId: 'assoc-1', queuedBy: 'user', deps,
    });

    expect(outcome.queued).toEqual(['item-1']);
    expect(outcome.skipped).toEqual([{ id: 'ghost', reason: 'Item not found' }]);
  });
});

describe('queueTrackerDeletionIfNeeded', () => {
  it('stages a delete with the linked item\'s remote identity', () => {
    const outboundChanges = {
      getByAssociation: vi.fn(() => []),
      addDelete: vi.fn(),
    };

    queueTrackerDeletionIfNeeded(
      {
        id: 'plan-1',
        project_id: 'project-1',
        external_key: 'ENG-123',
        external_id: 'issue-123',
        external_type: 'linear',
        association_id: 'assoc-1',
      },
      'user',
      { outboundChanges } as never
    );

    expect(outboundChanges.addDelete).toHaveBeenCalledWith({
      kpm_project_id: 'project-1',
      association_id: 'assoc-1',
      external_key: 'ENG-123',
      external_id: 'issue-123',
      tracker_type: 'linear',
      queued_by: 'user',
    });
  });

  it('does not stage a duplicate delete', () => {
    const outboundChanges = {
      getByAssociation: vi.fn(() => [{ operation: 'delete', external_key: 'ENG-123' }]),
      addDelete: vi.fn(),
    };

    queueTrackerDeletionIfNeeded(
      {
        id: 'plan-1',
        project_id: 'project-1',
        external_key: 'ENG-123',
        external_type: 'jira',
        association_id: 'assoc-1',
      },
      'user',
      { outboundChanges } as never
    );

    expect(outboundChanges.addDelete).not.toHaveBeenCalled();
  });
});
