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
    work_brief_revision: 1,
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
function createHarness(
  seed: PlanItem[] = [],
  connectedRepoIds: string[] = [],
  trackerAssociations: { id: string }[] = [],
) {
  const store = new Map<string, PlanItem>(seed.map((item) => [item.id, item]));
  const groupStore = new Map<string, { id: string; project_id: string }>();

  const add = vi.fn((item: PlanItem) => {
    store.set(item.id, makeItem(item));
  });
  const update = vi.fn((id: string, updates: Partial<PlanItem>) => {
    const existing = store.get(id);
    if (existing) store.set(id, { ...existing, ...updates });
  });
  const del = vi.fn((id: string) => store.delete(id));
  const compareAndReviseWorkBrief = vi.fn((id: string, expectedRevision: number, brief: {
    title: string; description: string | null; intent: string | null; acceptance_criteria: string[];
  }) => {
    const existing = store.get(id);
    if (!existing) return { status: 'not_found' as const };
    if (existing.work_brief_revision !== expectedRevision) return { status: 'conflict' as const, item: existing };
    const unchanged = existing.title === brief.title
      && existing.description === brief.description
      && existing.intent === brief.intent
      && JSON.stringify(existing.acceptance_criteria ?? []) === JSON.stringify(brief.acceptance_criteria);
    if (unchanged) return { status: 'unchanged' as const, item: existing };
    const item = {
      ...existing,
      title: brief.title,
      description: brief.description,
      intent: brief.intent,
      acceptance_criteria: brief.acceptance_criteria.length > 0 ? brief.acceptance_criteria : null,
      work_brief_revision: existing.work_brief_revision + 1,
    };
    store.set(id, item);
    return { status: 'updated' as const, item };
  });
  const updatePosition = vi.fn();
  const setRepositoryTargets = vi.fn();
  const batchReparent = vi.fn((updates: { id: string; parentId: string | null }[]) => {
    for (const { id, parentId } of updates) {
      const existing = store.get(id);
      if (existing) store.set(id, { ...existing, parent_id: parentId });
    }
  });
  const relationAdd = vi.fn((relation: unknown) => relation);
  const groupCreate = vi.fn((group: { project_id: string }, id: string) => {
    groupStore.set(id, { ...group, id });
  });
  const groupUpdate = vi.fn();
  const groupDelete = vi.fn((id: string) => groupStore.delete(id));
  const outboundAdd = vi.fn();
  const queueTrackerUpdateIfNeeded = vi.fn();
  const getDescendantIds = vi.fn(() => [] as string[]);
  const deleteWithDescendants = vi.fn();
  const addDelete = vi.fn();

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
    compareAndReviseWorkBrief,
    update,
    delete: del,
    deleteWithDescendants,
    getDescendantIds,
    updatePosition,
    batchReparent,
  };

  // Mirrors better-sqlite3's contract enough for `removePlanItem`'s SAVEPOINT
  // calls: `transaction()` runs the batch synchronously and lets a thrown
  // error propagate, `exec()` is a no-op recorder (real commit/rollback
  // semantics are covered by PlanItemRemoval.test.ts against a real db).
  const database = { transaction: (fn: () => void) => fn, exec: vi.fn() } as unknown as Database;

  const deps: PlanActionExecutorDeps = {
    database,
    planItems: planItems as unknown as PlanActionExecutorDeps['planItems'],
    planRelations: { add: relationAdd, remove: vi.fn() } as unknown as PlanActionExecutorDeps['planRelations'],
    groups: {
      create: groupCreate,
      getById: (id: string) => groupStore.get(id),
      update: groupUpdate,
      delete: groupDelete,
    } as unknown as PlanActionExecutorDeps['groups'],
    tracker: { getAssociationsByProject: vi.fn(() => trackerAssociations) } as unknown as PlanActionExecutorDeps['tracker'],
    outboundChanges: {
      getByProject: vi.fn(() => []),
      getByAssociation: vi.fn(() => []),
      add: outboundAdd,
      updateStatusCategory: vi.fn(),
      addDelete,
    } as unknown as PlanActionExecutorDeps['outboundChanges'],
    repos: {
      getByProject: vi.fn(() => connectedRepoIds.map((id) => ({ id, project_id: PROJECT_ID, path: `/tmp/${id}` }))),
    },
    queueTrackerUpdateIfNeeded,
    logger: { log: vi.fn(), warn: vi.fn() },
  };

  return {
    deps,
    store,
    spies: {
      add, setRepositoryTargets, compareAndReviseWorkBrief, update, del, deleteWithDescendants, getDescendantIds,
      updatePosition, batchReparent, relationAdd, addDelete, queueTrackerUpdateIfNeeded,
      groupCreate, groupUpdate, groupDelete, outboundAdd,
    },
  };
}

function run(deps: PlanActionExecutorDeps, actions: PlanAction[]) {
  return createPlanActionExecutor(deps).execute(PROJECT_ID, actions);
}

type HarnessSpies = ReturnType<typeof createHarness>['spies'];

interface PlaceholderCase {
  name: string;
  /** The action that mints `$1`. */
  creator: PlanAction;
  seed?: PlanItem[];
  connectedRepoIds?: string[];
  trackerAssociations?: { id: string }[];
  action: (ref: string) => PlanAction;
  expectResolved: (spies: HarnessSpies, createdId: string) => void;
}

const CREATE_ITEM: PlanAction = { type: 'create_item', title: 'Parent', parent_id: null };
const CREATE_GROUP: PlanAction = {
  type: 'create_group', project_id: PROJECT_ID, name: 'Must Do',
  position_x: 0, position_y: 0, width: 552, height: 300,
};

const PLACEHOLDER_CASES: PlaceholderCase[] = [
  {
    name: 'create_item.parent_id',
    creator: CREATE_ITEM,
    action: (ref) => ({ type: 'create_item', title: 'Child', parent_id: ref }),
    expectResolved: (spies, createdId) => {
      expect(spies.add).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Child', parent_id: createdId }),
      );
    },
  },
  {
    name: 'reparent.item_id',
    creator: CREATE_ITEM,
    action: (ref) => ({ type: 'reparent', item_id: ref, new_parent_id: null }),
    expectResolved: (spies, createdId) => {
      expect(spies.batchReparent).toHaveBeenCalledWith([{ id: createdId, parentId: null }]);
    },
  },
  {
    name: 'set_label.item_id',
    creator: CREATE_ITEM,
    action: (ref) => ({ type: 'set_label', item_id: ref, label: 'epic' }),
    expectResolved: (spies, createdId) => {
      expect(spies.update).toHaveBeenCalledWith(createdId, { label: 'epic' });
    },
  },
  {
    name: 'set_release.item_id',
    creator: CREATE_ITEM,
    action: (ref) => ({ type: 'set_release', item_id: ref, release_tag: 'v1' }),
    expectResolved: (spies, createdId) => {
      expect(spies.update).toHaveBeenCalledWith(createdId, { release_tag: 'v1' });
    },
  },
  {
    name: 'add_dependency.from_id',
    creator: CREATE_ITEM,
    action: (ref) => ({ type: 'add_dependency', from_id: ref, to_id: 'existing-2', relation_type: 'blocks' }),
    expectResolved: (spies, createdId) => {
      expect(spies.relationAdd).toHaveBeenCalledWith(
        expect.objectContaining({ from_item_id: createdId, to_item_id: 'existing-2', relation_type: 'blocks' }),
      );
    },
  },
  {
    name: 'reorder.item_id',
    creator: CREATE_ITEM,
    action: (ref) => ({ type: 'reorder', item_id: ref, after_item_id: null }),
    expectResolved: (spies, createdId) => {
      expect(spies.update).toHaveBeenCalledWith(createdId, { item_order: 0 });
    },
  },
  {
    name: 'update_item.item_id',
    creator: CREATE_ITEM,
    action: (ref) => ({ type: 'update_item', item_id: ref, updates: { status_category: 'in_progress' } }),
    expectResolved: (spies, createdId) => {
      expect(spies.update).toHaveBeenCalledWith(createdId, { status_category: 'in_progress' });
    },
  },
  {
    name: 'revise_work_brief.item_id',
    creator: CREATE_ITEM,
    action: (ref) => ({
      type: 'revise_work_brief', item_id: ref, expected_revision: 1,
      work_brief: { title: 'Revised', description: null, intent: null, acceptance_criteria: [] },
    }),
    expectResolved: (spies, createdId) => {
      expect(spies.compareAndReviseWorkBrief).toHaveBeenCalledWith(
        createdId, 1, expect.objectContaining({ title: 'Revised' }),
      );
    },
  },
  {
    name: 'set_repo_targets.item_id',
    creator: CREATE_ITEM,
    connectedRepoIds: ['repo-a', 'repo-b'],
    action: (ref) => ({
      type: 'set_repo_targets', item_id: ref,
      repository_scope: { primary_repo_id: 'repo-a', affected_repo_ids: [] },
    }),
    expectResolved: (spies, createdId) => {
      expect(spies.setRepositoryTargets).toHaveBeenCalledWith(createdId, 'repo-a', []);
    },
  },
  {
    name: 'delete_item.item_id',
    creator: CREATE_ITEM,
    action: (ref) => ({ type: 'delete_item', item_id: ref }),
    expectResolved: (spies, createdId) => {
      expect(spies.del).toHaveBeenCalledWith(createdId);
    },
  },
  {
    name: 'set_position.item_id',
    creator: CREATE_ITEM,
    action: (ref) => ({ type: 'set_position', item_id: ref, x: 12, y: 34 }),
    expectResolved: (spies, createdId) => {
      expect(spies.updatePosition).toHaveBeenCalledWith(createdId, 12, 34);
    },
  },
  {
    name: 'queue_for_tracker.item_ids',
    creator: CREATE_ITEM,
    trackerAssociations: [{ id: 'assoc-1' }],
    action: (ref) => ({ type: 'queue_for_tracker', item_ids: [ref] }),
    expectResolved: (spies, createdId) => {
      expect(spies.outboundAdd).toHaveBeenCalledWith(
        expect.objectContaining({ plan_item_id: createdId, association_id: 'assoc-1' }),
      );
    },
  },
  {
    name: 'assign_to_group.item_id',
    creator: CREATE_ITEM,
    action: (ref) => ({ type: 'assign_to_group', item_id: ref, group_id: null }),
    expectResolved: (spies, createdId) => {
      expect(spies.update).toHaveBeenCalledWith(
        createdId, { group_id: null, position_x: null, position_y: null },
      );
    },
  },
  {
    name: 'assign_to_group.group_id',
    creator: CREATE_GROUP,
    seed: [makeItem({ id: 'a' })],
    action: (ref) => ({ type: 'assign_to_group', item_id: 'a', group_id: ref }),
    expectResolved: (spies, createdId) => {
      expect(spies.update).toHaveBeenCalledWith(
        'a', { group_id: createdId, position_x: null, position_y: null },
      );
    },
  },
  {
    name: 'update_group.group_id',
    creator: CREATE_GROUP,
    action: (ref) => ({ type: 'update_group', group_id: ref, updates: { name: 'Renamed' } }),
    expectResolved: (spies, createdId) => {
      expect(spies.groupUpdate).toHaveBeenCalledWith(createdId, { name: 'Renamed' });
    },
  },
  {
    name: 'delete_group.group_id',
    creator: CREATE_GROUP,
    action: (ref) => ({ type: 'delete_group', group_id: ref }),
    expectResolved: (spies, createdId) => {
      expect(spies.groupDelete).toHaveBeenCalledWith(createdId);
    },
  },
];

describe.each(PLACEHOLDER_CASES)('placeholder refs in $name', (testCase) => {
  const harnessFor = () => createHarness(
    testCase.seed ?? [],
    testCase.connectedRepoIds ?? [],
    testCase.trackerAssociations ?? [],
  );

  it('resolves to the entity created earlier in the same batch', () => {
    const { deps, spies } = harnessFor();

    const result = run(deps, [testCase.creator, testCase.action('$1')]);

    expect(result.error).toBeUndefined();
    expect(result.skippedActions).toBeUndefined();
    const createdId = result.createdIds?.$1;
    expect(createdId).toBeTruthy();
    testCase.expectResolved(spies, createdId!);
  });

  it('reports a skip when the placeholder names nothing in the batch', () => {
    const { deps } = harnessFor();
    const action = testCase.action('$9');

    const result = run(deps, [action]);

    expect(result.success).toBe(true);
    expect(result.skippedActions).toEqual([
      { index: 0, type: action.type, reason: expect.stringMatching(/^Unresolved placeholder \$9 in /) },
    ]);
  });
});

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

  it('passes an explicit primary repo and affected repos through to setRepositoryTargets unfiltered', () => {
    // Dedup of primary-vs-affected happens in PlanItemRepository.setRepositoryTargets
    // (see PlanItemRepository.add.test.ts), not in this executor, so the raw
    // affected list — including a repeat of the primary — is expected here as-is.
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

  it('queues a tracker update when an existing item is updated', () => {
    const { deps, spies } = createHarness([makeItem({ id: 'a', external_key: 'ENG-1' })]);

    const result = run(deps, [{ type: 'update_item', item_id: 'a', updates: { status_category: 'in_progress' } }]);

    expect(result.success).toBe(true);
    expect(spies.update).toHaveBeenCalledWith('a', { status_category: 'in_progress' });
    expect(spies.queueTrackerUpdateIfNeeded).toHaveBeenCalledTimes(1);
  });

  it('revises the full Work Brief and queues tracker sync only for title/description changes', () => {
    const { deps, store, spies } = createHarness([makeItem({ id: 'a', title: 'Old', intent: 'Old intent' })]);

    const result = run(deps, [{
      type: 'revise_work_brief',
      item_id: 'a',
      expected_revision: 1,
      work_brief: {
        title: 'New',
        description: 'Context',
        intent: 'New intent',
        acceptance_criteria: ['Done'],
      },
    }]);

    expect(result.success).toBe(true);
    expect(store.get('a')).toMatchObject({ title: 'New', description: 'Context', work_brief_revision: 2 });
    expect(spies.queueTrackerUpdateIfNeeded).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Old' }),
      { title: 'New', description: 'Context' },
      'claude',
    );
  });

  it('fails the batch on a stale Work Brief revision', () => {
    const { deps, spies } = createHarness([makeItem({ id: 'a', work_brief_revision: 2 })]);

    const result = run(deps, [{
      type: 'revise_work_brief', item_id: 'a', expected_revision: 1,
      work_brief: { title: 'New', description: null, intent: null, acceptance_criteria: [] },
    }]);

    expect(result.success).toBe(false);
    expect(result.error).toContain('revision conflict');
    expect(spies.queueTrackerUpdateIfNeeded).not.toHaveBeenCalled();
  });

  it('replaces repository scope without tracker sync or brief revision changes', () => {
    const item = makeItem({ id: 'a', work_brief_revision: 4, primary_repo_id: null, affected_repo_ids: [] });
    const { deps, spies } = createHarness([item], ['repo-primary', 'repo-affected']);

    const result = run(deps, [{
      type: 'set_repo_targets', item_id: 'a',
      repository_scope: { primary_repo_id: 'repo-primary', affected_repo_ids: ['repo-affected'] },
    }]);

    expect(result.success).toBe(true);
    expect(spies.setRepositoryTargets).toHaveBeenCalledWith('a', 'repo-primary', ['repo-affected']);
    expect(spies.queueTrackerUpdateIfNeeded).not.toHaveBeenCalled();
    expect(item.work_brief_revision).toBe(4);
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

  it('orphans descendants by default and removes the subtree when the action asks to cascade', () => {
    const parent = makeItem({ id: 'parent' });
    const child = makeItem({ id: 'child', parent_id: 'parent' });

    const orphaning = createHarness([parent, child]);
    orphaning.spies.getDescendantIds.mockReturnValue(['child']);
    expect(run(orphaning.deps, [{ type: 'delete_item', item_id: 'parent' }]).success).toBe(true);
    expect(orphaning.spies.del).toHaveBeenCalledWith('parent');
    expect(orphaning.spies.deleteWithDescendants).not.toHaveBeenCalled();

    const cascading = createHarness([parent, child]);
    cascading.spies.getDescendantIds.mockReturnValue(['child']);
    expect(run(cascading.deps, [{ type: 'delete_item', item_id: 'parent', cascade: true }]).success).toBe(true);
    expect(cascading.spies.deleteWithDescendants).toHaveBeenCalledWith('parent');
    expect(cascading.spies.del).not.toHaveBeenCalled();
  });

  it('stages a tracker deletion when Claude deletes a linked item', () => {
    const item = makeItem({
      id: 'linked',
      external_key: 'ENG-123',
      external_id: 'issue-123',
      external_type: 'linear',
      association_id: 'association-1',
    });
    const { deps, spies } = createHarness([item]);

    const result = run(deps, [{ type: 'delete_item', item_id: 'linked' }]);

    expect(result.success).toBe(true);
    expect(spies.addDelete).toHaveBeenCalledWith(expect.objectContaining({
      association_id: 'association-1',
      external_key: 'ENG-123',
      external_id: 'issue-123',
      tracker_type: 'linear',
      queued_by: 'claude',
    }));
    expect(spies.del).toHaveBeenCalledWith('linked');
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

  it('rejects unknown plan refs nested in a Work Brief', () => {
    const { deps, spies } = createHarness([makeItem({ id: 'a' })]);

    const result = run(deps, [{
      type: 'revise_work_brief', item_id: 'a', expected_revision: 1,
      work_brief: {
        title: 'Task', description: null, intent: null,
        acceptance_criteria: ['Depends on @plan/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      },
    }]);

    expect(result.success).toBe(false);
    expect(spies.compareAndReviseWorkBrief).not.toHaveBeenCalled();
  });

  it('rejects repository scope targets outside the project', () => {
    const { deps, spies } = createHarness([makeItem({ id: 'a' })], ['repo-connected']);

    const result = run(deps, [{
      type: 'set_repo_targets', item_id: 'a',
      repository_scope: { primary_repo_id: 'repo-other', affected_repo_ids: [] },
    }]);

    expect(result.success).toBe(false);
    expect(spies.setRepositoryTargets).not.toHaveBeenCalled();
  });

  it('reports a skip for a placeholder in a field that never accepts one', () => {
    const { deps } = createHarness();

    const result = run(deps, [{ type: 'remove_dependency', relation_id: '$1' }]);

    expect(result.success).toBe(true);
    expect(result.skippedActions).toEqual([
      { index: 0, type: 'remove_dependency', reason: 'relation_id does not accept a placeholder: $1' },
    ]);
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
