import { describe, expect, it, vi } from 'vitest';
import { removePlanItem, type RemovePlanItemDeps } from './PlanItemRemoval';
import { createPlanItem, createTestRepositoryContext, type CreatePlanItemOptions } from '../../../../tests';
import type { PlanItem } from '../../../shared/types';

function makeItem(overrides: CreatePlanItemOptions & { id: string }): PlanItem {
  return createPlanItem({ project_id: 'project-1', ...overrides });
}

function makeMockedDeps(seed: PlanItem[]): {
  deps: RemovePlanItemDeps;
  store: Map<string, PlanItem>;
  descendantsByParent: Map<string, string[]>;
  addDelete: ReturnType<typeof vi.fn>;
} {
  const store = new Map(seed.map((item) => [item.id, item]));
  const descendantsByParent = new Map<string, string[]>();
  const addDelete = vi.fn();

  const deps: RemovePlanItemDeps = {
    database: { exec: vi.fn() },
    planItems: {
      get: (id) => store.get(id),
      getMany: (ids) => ids.map((id) => store.get(id)).filter((i): i is PlanItem => !!i),
      getDescendantIds: (id) => descendantsByParent.get(id) ?? [],
      delete: vi.fn((id: string) => store.delete(id)),
      deleteWithDescendants: vi.fn((id: string) => {
        store.delete(id);
        for (const descendantId of descendantsByParent.get(id) ?? []) store.delete(descendantId);
      }),
    },
    outboundChanges: {
      getByAssociation: vi.fn(() => []),
      addDelete,
    } as unknown as RemovePlanItemDeps['outboundChanges'],
  };

  return { deps, store, descendantsByParent, addDelete };
}

describe('removePlanItem', () => {
  it('returns not_found without touching outboundChanges or the repository writes', () => {
    const { deps, addDelete } = makeMockedDeps([]);

    const result = removePlanItem('missing', { queuedBy: 'user', cascade: false }, deps);

    expect(result).toEqual({ status: 'not_found' });
    expect(addDelete).not.toHaveBeenCalled();
  });

  it('cascade:false stages only the root item and orphans via delete()', () => {
    const item = makeItem({ id: 'a', external_key: 'ENG-1', external_id: 'issue-1', external_type: 'linear', association_id: 'assoc-1' });
    const { deps, store } = makeMockedDeps([item]);

    const result = removePlanItem('a', { queuedBy: 'user', cascade: false }, deps);

    expect(result).toEqual({ status: 'removed', removedIds: ['a'] });
    expect(deps.planItems.delete).toHaveBeenCalledWith('a');
    expect(deps.planItems.deleteWithDescendants).not.toHaveBeenCalled();
    expect(store.has('a')).toBe(false);
  });

  it('cascade:true stages the root and every descendant, then removes the whole subtree via deleteWithDescendants()', () => {
    const root = makeItem({ id: 'root', external_key: 'ENG-1', external_type: 'linear', association_id: 'assoc-root' });
    const child = makeItem({ id: 'child', parent_id: 'root', external_key: 'ENG-2', external_type: 'linear', association_id: 'assoc-child' });
    const grandchild = makeItem({ id: 'grandchild', parent_id: 'child' });
    const { deps, descendantsByParent, addDelete } = makeMockedDeps([root, child, grandchild]);
    descendantsByParent.set('root', ['child', 'grandchild']);

    const result = removePlanItem('root', { queuedBy: 'claude', cascade: true }, deps);

    expect(result).toEqual({ status: 'removed', removedIds: ['root', 'child', 'grandchild'] });
    expect(addDelete).toHaveBeenCalledTimes(2);
    expect(addDelete).toHaveBeenCalledWith(expect.objectContaining({ association_id: 'assoc-root', queued_by: 'claude' }));
    expect(addDelete).toHaveBeenCalledWith(expect.objectContaining({ association_id: 'assoc-child', queued_by: 'claude' }));
    expect(deps.planItems.deleteWithDescendants).toHaveBeenCalledWith('root');
    expect(deps.planItems.delete).not.toHaveBeenCalled();
  });

  it('propagates a thrown error from the delete step after rolling back the savepoint', () => {
    const item = makeItem({ id: 'a' });
    const { deps } = makeMockedDeps([item]);
    (deps.planItems.delete as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('constraint failed');
    });

    expect(() => removePlanItem('a', { queuedBy: 'user', cascade: false }, deps)).toThrow('constraint failed');
    expect(deps.database.exec).toHaveBeenCalledWith(expect.stringContaining('ROLLBACK TO SAVEPOINT'));
  });

  describe('against a real database', () => {
    function setupLinkedItem(ctx: ReturnType<typeof createTestRepositoryContext>) {
      const project = ctx.repos.projects.create({ name: 'Removal Test' });
      const connection = ctx.repos.tracker.createConnection('linear', 'linear.app', 'Linear');
      const scope = ctx.repos.tracker.createScope(connection.id, 'ENG', 'Engineering');
      const association = ctx.repos.tracker.createAssociation(
        project.id,
        scope.id,
        JSON.stringify({ teamKey: 'ENG' }),
        'Engineering'
      );
      const item = ctx.repos.planItems.add(createPlanItem({
        id: 'linked-item',
        project_id: project.id,
        title: 'Linked',
        external_key: 'ENG-1',
        external_id: 'issue-1',
        external_type: 'linear',
        association_id: association.id,
      }));
      return { project, association, item };
    }

    it('stages the tracker deletion and deletes the item as one unit — no staged row survives if delete throws', () => {
      const ctx = createTestRepositoryContext();
      const { association, item } = setupLinkedItem(ctx);

      const throwingPlanItems: RemovePlanItemDeps['planItems'] = {
        get: ctx.repos.planItems.get.bind(ctx.repos.planItems),
        getMany: ctx.repos.planItems.getMany.bind(ctx.repos.planItems),
        getDescendantIds: ctx.repos.planItems.getDescendantIds.bind(ctx.repos.planItems),
        deleteWithDescendants: ctx.repos.planItems.deleteWithDescendants.bind(ctx.repos.planItems),
        delete: () => { throw new Error('simulated delete failure'); },
      };

      expect(() => removePlanItem(item.id, { queuedBy: 'user', cascade: false }, {
        database: ctx.db,
        planItems: throwingPlanItems,
        outboundChanges: ctx.repos.outboundChanges,
      })).toThrow('simulated delete failure');

      expect(ctx.repos.outboundChanges.getByAssociation(association.id)).toEqual([]);
      expect(ctx.repos.planItems.get(item.id)).toBeDefined();
    });

    it('commits the staged deletion and the delete together when it succeeds', () => {
      const ctx = createTestRepositoryContext();
      const { association, item } = setupLinkedItem(ctx);

      const result = removePlanItem(item.id, { queuedBy: 'user', cascade: false }, {
        database: ctx.db,
        planItems: ctx.repos.planItems,
        outboundChanges: ctx.repos.outboundChanges,
      });

      expect(result).toEqual({ status: 'removed', removedIds: [item.id] });
      expect(ctx.repos.planItems.get(item.id)).toBeUndefined();
      const staged = ctx.repos.outboundChanges.getByAssociation(association.id);
      expect(staged).toHaveLength(1);
      expect(staged[0]).toMatchObject({ operation: 'delete', external_key: 'ENG-1' });
    });

    it('nests inside an already-open transaction the way PlanActionService calls it, and still commits', () => {
      const ctx = createTestRepositoryContext();
      const { association, item } = setupLinkedItem(ctx);

      const runInsideOuterTransaction = ctx.db.transaction(() => {
        removePlanItem(item.id, { queuedBy: 'claude', cascade: false }, {
          database: ctx.db,
          planItems: ctx.repos.planItems,
          outboundChanges: ctx.repos.outboundChanges,
        });
      });

      expect(() => runInsideOuterTransaction()).not.toThrow();
      expect(ctx.repos.planItems.get(item.id)).toBeUndefined();
      expect(ctx.repos.outboundChanges.getByAssociation(association.id)).toHaveLength(1);
    });

    it('rolls back the outer transaction too when the nested removal throws', () => {
      const ctx = createTestRepositoryContext();
      const { association, item } = setupLinkedItem(ctx);
      const sibling = ctx.repos.planItems.add(createPlanItem({ id: 'sibling', project_id: item.project_id, title: 'Sibling' }));

      const throwingPlanItems: RemovePlanItemDeps['planItems'] = {
        get: ctx.repos.planItems.get.bind(ctx.repos.planItems),
        getMany: ctx.repos.planItems.getMany.bind(ctx.repos.planItems),
        getDescendantIds: ctx.repos.planItems.getDescendantIds.bind(ctx.repos.planItems),
        deleteWithDescendants: ctx.repos.planItems.deleteWithDescendants.bind(ctx.repos.planItems),
        delete: () => { throw new Error('boom'); },
      };

      const runInsideOuterTransaction = ctx.db.transaction(() => {
        ctx.repos.planItems.update(sibling.id, { title: 'Touched before the failure' });
        removePlanItem(item.id, { queuedBy: 'claude', cascade: false }, {
          database: ctx.db,
          planItems: throwingPlanItems,
          outboundChanges: ctx.repos.outboundChanges,
        });
      });

      expect(() => runInsideOuterTransaction()).toThrow('boom');
      expect(ctx.repos.planItems.get(sibling.id)?.title).toBe('Sibling');
      expect(ctx.repos.outboundChanges.getByAssociation(association.id)).toEqual([]);
    });
  });
});
