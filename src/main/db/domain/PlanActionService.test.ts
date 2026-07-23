import { describe, it, expect, vi } from 'vitest';
import type { Database } from 'better-sqlite3';
import { createPlanActionExecutor, type PlanActionExecutorDeps } from './PlanActionService';
import type { PlanAction, PlanItem } from '../../../shared/types';

const PROJECT_ID = 'proj-1';

function makeItem(overrides: Partial<PlanItem> & { id: string }): PlanItem {
  return {
    project_id: PROJECT_ID,
    parent_id: null,
    title: 'Item',
    description: null,
    intent: null,
    acceptance_criteria: null,
    source_document_id: null,
    label: 'task',
    item_order: 0,
    code_refs: null,
    status: 'planned',
    release_tag: null,
    position_x: null,
    position_y: null,
    group_id: null,
    external_key: null,
    external_id: null,
    external_type: null,
    external_status: null,
    status_category: 'not_started',
    external_url: null,
    ...overrides,
  } as PlanItem;
}

/**
 * A stateful in-memory stand-in for the repositories the executor drives, plus
 * spies on the mutating methods. The `database.transaction` mock runs the batch
 * synchronously and lets a thrown error propagate — the same contract as
 * better-sqlite3 — so the executor's catch/rollback path is exercised without a
 * real database.
 */
function createHarness(seed: PlanItem[] = [], connectedRepoIds: string[] = []) {
  const store = new Map<string, PlanItem>(seed.map((item) => [item.id, item]));

  const add = vi.fn((item: PlanItem) => {
    store.set(item.id, makeItem(item));
  });
  const update = vi.fn((id: string, updates: Partial<PlanItem>) => {
    const existing = store.get(id);
    if (existing) store.set(id, { ...existing, ...updates });
  });
  const del = vi.fn((id: string) => store.delete(id));
  const updatePosition = vi.fn();
  const setRepositoryTargets = vi.fn();
  const batchReparent = vi.fn((updates: { id: string; parentId: string | null }[]) => {
    for (const { id, parentId } of updates) {
      const existing = store.get(id);
      if (existing) store.set(id, { ...existing, parent_id: parentId });
    }
  });
  const relationAdd = vi.fn((relation: unknown) => relation);
  const queueTrackerUpdateIfNeeded = vi.fn();

  const planItems = {
    get: (id: string) => store.get(id),
    getMany: (ids: string[]) => ids.map((id) => store.get(id)).filter((i): i is PlanItem => !!i),
    getByProject: () => [...store.values()],
    getNextOrder: () => 0,
    getSiblings: (_projectId: string, parentId: string | null, excludeId: string) =>
      [...store.values()]
        .filter((i) => i.parent_id === parentId && i.id !== excludeId)
        .map((i) => ({ id: i.id, item_order: i.item_order }))
        .sort((a, b) => a.item_order - b.item_order),
    add,
    setRepositoryTargets,
    update,
    delete: del,
    updatePosition,
    batchReparent,
  };

  const database = { transaction: (fn: () => void) => fn } as unknown as Database;

  const deps: PlanActionExecutorDeps = {
    database,
    planItems: planItems as unknown as PlanActionExecutorDeps['planItems'],
    planRelations: { add: relationAdd, remove: vi.fn() } as unknown as PlanActionExecutorDeps['planRelations'],
    groups: {
      create: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as PlanActionExecutorDeps['groups'],
    tracker: { getAssociationsByProject: vi.fn(() => []) } as unknown as PlanActionExecutorDeps['tracker'],
    outboundChanges: { getByProject: vi.fn(() => []) } as unknown as PlanActionExecutorDeps['outboundChanges'],
    repos: {
      getByProject: vi.fn(() => connectedRepoIds.map((id) => ({ id, project_id: PROJECT_ID, path: `/tmp/${id}` }))),
    },
    queueTrackerUpdateIfNeeded,
    logger: { log: vi.fn(), warn: vi.fn() },
  };

  return { deps, store, spies: { add, setRepositoryTargets, update, del, updatePosition, batchReparent, relationAdd, queueTrackerUpdateIfNeeded } };
}

function run(deps: PlanActionExecutorDeps, actions: PlanAction[]) {
  return createPlanActionExecutor(deps).execute(PROJECT_ID, actions);
}

describe('createPlanActionExecutor', () => {
  it('creates an item, defaulting the label to "story" when none is given', () => {
    const { deps, store, spies } = createHarness();

    const result = run(deps, [{ type: 'create_item', title: 'New', parent_id: null }]);

    expect(result.success).toBe(true);
    const created = [...store.values()][0];
    expect(created.title).toBe('New');
    expect(created.label).toBe('story');
    expect(created.status_category).toBe('not_started');
    // The one created item is auto-queued for tracker sync.
    expect(spies.queueTrackerUpdateIfNeeded).toHaveBeenCalledTimes(1);
  });

  it('assigns the sole connected repo when create_item omits repo targets', () => {
    const { deps, spies } = createHarness([], ['repo-only']);

    const result = run(deps, [{ type: 'create_item', title: 'New', parent_id: null }]);

    expect(result.success).toBe(true);
    const createdId = result.createdIds?.$1;
    expect(spies.setRepositoryTargets).toHaveBeenCalledWith(createdId, 'repo-only', []);
  });

  it('persists an explicit primary repo plus distinct affected repos', () => {
    const { deps, spies } = createHarness([], ['repo-primary', 'repo-affected']);

    const result = run(deps, [{
      type: 'create_item',
      title: 'Cross-repo item',
      parent_id: null,
      primary_repo_id: 'repo-primary',
      affected_repo_ids: ['repo-affected', 'repo-primary'],
    }]);

    expect(result.success).toBe(true);
    const createdId = result.createdIds?.$1;
    expect(spies.setRepositoryTargets).toHaveBeenCalledWith(
      createdId,
      'repo-primary',
      ['repo-affected', 'repo-primary'],
    );
  });

  it('rejects repo targets that are not connected to the project', () => {
    const { deps, spies } = createHarness([], ['repo-connected']);

    const result = run(deps, [{
      type: 'create_item',
      title: 'Invalid target',
      parent_id: null,
      primary_repo_id: 'repo-other',
    }]);

    expect(result.success).toBe(false);
    expect(result.error).toContain('repo-other');
    expect(spies.add).not.toHaveBeenCalled();
  });

  it('resolves a $-placeholder id from an earlier create in the same batch', () => {
    const { deps, spies } = createHarness();

    const result = run(deps, [
      { type: 'create_item', title: 'Parent', parent_id: null },
      { type: 'add_dependency', from_id: '$1', to_id: 'existing-2', relation_type: 'blocks' },
    ]);

    expect(result.success).toBe(true);
    const createdId = result.createdIds?.$1;
    expect(createdId).toBeTruthy();
    expect(spies.relationAdd).toHaveBeenCalledWith(
      expect.objectContaining({ from_item_id: createdId, to_item_id: 'existing-2', relation_type: 'blocks' }),
    );
  });

  it('queues a tracker update when an existing item is updated', () => {
    const { deps, spies } = createHarness([makeItem({ id: 'a', external_key: 'ENG-1' })]);

    const result = run(deps, [{ type: 'update_item', item_id: 'a', updates: { title: 'Renamed' } }]);

    expect(result.success).toBe(true);
    expect(spies.update).toHaveBeenCalledWith('a', { title: 'Renamed' });
    expect(spies.queueTrackerUpdateIfNeeded).toHaveBeenCalledTimes(1);
  });

  it('skips (does not throw) a delete of a missing item and still succeeds', () => {
    const { deps, spies } = createHarness();

    const result = run(deps, [{ type: 'delete_item', item_id: 'ghost' }]);

    expect(result.success).toBe(true);
    expect(spies.del).not.toHaveBeenCalled();
    expect(result.skippedActions).toEqual([
      { index: 0, type: 'delete_item', reason: 'Item not found: ghost' },
    ]);
  });

  it('reorders an item between two siblings using the midpoint order', () => {
    const { deps, spies } = createHarness([
      makeItem({ id: 'x', item_order: 0 }),
      makeItem({ id: 'a', item_order: 10 }),
      makeItem({ id: 'b', item_order: 20 }),
    ]);

    const result = run(deps, [{ type: 'reorder', item_id: 'x', after_item_id: 'a' }]);

    expect(result.success).toBe(true);
    expect(spies.update).toHaveBeenCalledWith('x', { item_order: 15 });
  });

  it('skips a reparent that would make an item its own parent', () => {
    const { deps, spies } = createHarness([makeItem({ id: 'a' })]);

    const result = run(deps, [{ type: 'reparent', item_id: 'a', new_parent_id: 'a' }]);

    expect(result.success).toBe(true);
    expect(spies.batchReparent).not.toHaveBeenCalled();
    expect(result.skippedActions?.[0]).toMatchObject({ type: 'reparent', reason: 'Cannot set item as its own parent' });
  });

  it('skips un-nesting a Jira subtask from its Jira parent, but batches a valid reparent', () => {
    const { deps, spies } = createHarness([
      makeItem({ id: 'parent', external_key: 'ENG-1' }),
      makeItem({ id: 'sub', parent_id: 'parent', external_parent_key: 'ENG-1' }),
      makeItem({ id: 'free', parent_id: null }),
    ]);

    const result = run(deps, [
      { type: 'reparent', item_id: 'sub', new_parent_id: null },
      { type: 'reparent', item_id: 'free', new_parent_id: 'parent' },
    ]);

    expect(result.success).toBe(true);
    expect(result.skippedActions).toEqual([
      { index: 0, type: 'reparent', reason: 'Cannot un-nest Jira subtask from its Jira parent' },
    ]);
    expect(spies.batchReparent).toHaveBeenCalledWith([{ id: 'free', parentId: 'parent' }]);
  });

  it('rejects the whole batch when a plan-ref points at an unknown item, without mutating', () => {
    const { deps, spies } = createHarness();

    const result = run(deps, [
      {
        type: 'create_item',
        title: 'See @plan/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        parent_id: null,
      },
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(spies.add).not.toHaveBeenCalled();
  });

  it('returns a failure (not a throw) when the transaction body throws', () => {
    const { deps, spies } = createHarness();
    spies.add.mockImplementationOnce(() => {
      throw new Error('constraint failed');
    });

    const result = run(deps, [{ type: 'create_item', title: 'Boom', parent_id: null }]);

    expect(result.success).toBe(false);
    expect(result.error).toContain('constraint failed');
  });
});
