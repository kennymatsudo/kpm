/**
 * Tests for plan-items.ts: resolveBulkTargetIds (filter resolution), and the
 * three consolidated tools (query_plan_items, get_plan_items, bulk_modify_plan).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import BetterSqlite3, { type Database } from 'better-sqlite3';
import { resolveBulkTargetIds, createPlanItemTools } from './plan-items';
import type { IPlanItemRepository, IPlanRelationRepository } from '../../db/interfaces';
import type { PlanAction, PlanItem, PlanRelation } from '../../../shared/types';

interface ToolCallResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

const dbHolder = vi.hoisted(() => ({ current: null as Database | null }));

vi.mock('../../db/connection', () => ({
  getDatabase: () => dbHolder.current,
}));

function setupSchema(db: Database): void {
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE plan_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      parent_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      intent TEXT,
      acceptance_criteria TEXT,
      source_document_id TEXT,
      label TEXT,
      item_order INTEGER NOT NULL,
      code_refs TEXT,
      status TEXT NOT NULL DEFAULT 'planned',
      release_tag TEXT,
      position_x REAL,
      position_y REAL,
      group_id TEXT,
      external_key TEXT,
      external_id TEXT,
      external_type TEXT,
      external_status TEXT,
      status_category TEXT,
      external_url TEXT,
      external_parent_key TEXT,
      updated_at TEXT
    );

    CREATE TABLE plan_relations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      from_item_id TEXT NOT NULL,
      to_item_id TEXT NOT NULL,
      relation_type TEXT NOT NULL
    );
  `);
  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('project-1', 'Project One');
}

interface ItemFixture {
  id: string;
  projectId?: string;
  parentId?: string | null;
  title?: string;
  label?: string | null;
  statusCategory?: string | null;
  releaseTag?: string | null;
  externalKey?: string | null;
  externalParentKey?: string | null;
  itemOrder?: number;
}

function insertItem(db: Database, item: ItemFixture): void {
  db.prepare(
    `INSERT INTO plan_items
      (id, project_id, parent_id, title, label, item_order, status_category, release_tag, external_key, external_parent_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    item.id,
    item.projectId ?? 'project-1',
    item.parentId ?? null,
    item.title ?? `Item ${item.id}`,
    item.label ?? null,
    item.itemOrder ?? 0,
    item.statusCategory ?? null,
    item.releaseTag ?? null,
    item.externalKey ?? null,
    item.externalParentKey ?? null
  );
}

function insertRelation(
  db: Database,
  relation: { id: string; projectId?: string; fromItemId: string; toItemId: string; relationType: 'depends_on' | 'blocks' | 'relates_to' }
): void {
  db.prepare(
    `INSERT INTO plan_relations (id, project_id, from_item_id, to_item_id, relation_type) VALUES (?, ?, ?, ?, ?)`
  ).run(relation.id, relation.projectId ?? 'project-1', relation.fromItemId, relation.toItemId, relation.relationType);
}

function createFakePlanItemRepo(db: Database): IPlanItemRepository {
  return {
    getByProject: (projectId) =>
      db.prepare('SELECT * FROM plan_items WHERE project_id = ?').all(projectId) as PlanItem[],
    get: (id) => db.prepare('SELECT * FROM plan_items WHERE id = ?').get(id) as PlanItem | undefined,
    add: () => {
      throw new Error('not implemented in fake repo');
    },
    getMany: (ids) => {
      if (ids.length === 0) return [];
      const placeholders = ids.map(() => '?').join(',');
      return db.prepare(`SELECT * FROM plan_items WHERE id IN (${placeholders})`).all(...ids) as PlanItem[];
    },
    setRepositoryTargets: () => {},
    getExistingIds: (ids) => {
      if (ids.length === 0) return new Set();
      const placeholders = ids.map(() => '?').join(',');
      const rows = db.prepare(`SELECT id FROM plan_items WHERE id IN (${placeholders})`).all(...ids) as { id: string }[];
      return new Set(rows.map((r) => r.id));
    },
    update: () => {},
    delete: () => {},
    deleteWithDescendants: () => {},
    getChildCount: () => 0,
    updatePosition: () => {},
    batchUpdatePositions: () => {},
    getNextOrder: () => 0,
    getChildrenByParent: () => [],
    getSiblings: () => [],
    batchReparent: () => [],
    batchUpdateStatus: () => {},
  };
}

function createFakePlanRelationRepo(db: Database): IPlanRelationRepository {
  return {
    getByProject: (projectId) =>
      db.prepare('SELECT * FROM plan_relations WHERE project_id = ?').all(projectId) as PlanRelation[],
    getByItemIds: (itemIds) => {
      if (itemIds.length === 0) return [];
      const placeholders = itemIds.map(() => '?').join(',');
      return db
        .prepare(
          `SELECT * FROM plan_relations WHERE from_item_id IN (${placeholders}) OR to_item_id IN (${placeholders})`
        )
        .all(...itemIds, ...itemIds) as PlanRelation[];
    },
    add: () => {
      throw new Error('not implemented in fake repo');
    },
    delete: () => {},
    remove: () => {},
    deleteByItem: () => {},
  };
}

function parseJson(result: ToolCallResult): any {
  return JSON.parse(result.content[0].text);
}

describe('resolveBulkTargetIds', () => {
  it('returns itemIds directly when provided, ignoring filter', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      setupSchema(db);
      insertItem(db, { id: 'a' });
      insertItem(db, { id: 'b' });

      const result = resolveBulkTargetIds(db, 'project-1', ['a', 'b'], { label: 'task' });
      expect(result).toEqual(['a', 'b']);
    } finally {
      db.close();
    }
  });

  it('returns null when neither itemIds nor filter is provided', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      setupSchema(db);
      const result = resolveBulkTargetIds(db, 'project-1', undefined, undefined);
      expect(result).toBeNull();
    } finally {
      db.close();
    }
  });

  it('resolves ids by a single filter field (label)', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      setupSchema(db);
      insertItem(db, { id: 'a', label: 'task' });
      insertItem(db, { id: 'b', label: 'feature' });
      insertItem(db, { id: 'c', label: 'task' });

      const result = resolveBulkTargetIds(db, 'project-1', undefined, { label: 'task' });
      expect(result).toEqual(['a', 'c']);
    } finally {
      db.close();
    }
  });

  it('resolves ids by releaseTag', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      setupSchema(db);
      insertItem(db, { id: 'a', releaseTag: 'v1' });
      insertItem(db, { id: 'b', releaseTag: 'v2' });

      const result = resolveBulkTargetIds(db, 'project-1', undefined, { releaseTag: 'v1' });
      expect(result).toEqual(['a']);
    } finally {
      db.close();
    }
  });

  it('resolves ids by hasParent: true (nested items only)', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      setupSchema(db);
      insertItem(db, { id: 'root' });
      insertItem(db, { id: 'child', parentId: 'root' });

      const result = resolveBulkTargetIds(db, 'project-1', undefined, { hasParent: true });
      expect(result).toEqual(['child']);
    } finally {
      db.close();
    }
  });

  it('resolves ids by hasParent: false (root items only)', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      setupSchema(db);
      insertItem(db, { id: 'root' });
      insertItem(db, { id: 'child', parentId: 'root' });

      const result = resolveBulkTargetIds(db, 'project-1', undefined, { hasParent: false });
      expect(result).toEqual(['root']);
    } finally {
      db.close();
    }
  });

  it('combines multiple filter fields with AND', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      setupSchema(db);
      insertItem(db, { id: 'a', parentId: 'root-1', statusCategory: 'in_progress', label: 'task' });
      insertItem(db, { id: 'b', parentId: 'root-1', statusCategory: 'done', label: 'task' });
      insertItem(db, { id: 'c', parentId: 'root-2', statusCategory: 'in_progress', label: 'task' });

      const result = resolveBulkTargetIds(db, 'project-1', undefined, {
        parentId: 'root-1',
        statusCategory: 'in_progress',
      });
      expect(result).toEqual(['a']);
    } finally {
      db.close();
    }
  });

  it('scopes the filter query to the given project', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      setupSchema(db);
      db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('project-2', 'Project Two');
      insertItem(db, { id: 'a', projectId: 'project-1', label: 'task' });
      insertItem(db, { id: 'b', projectId: 'project-2', label: 'task' });

      const result = resolveBulkTargetIds(db, 'project-1', undefined, { label: 'task' });
      expect(result).toEqual(['a']);
    } finally {
      db.close();
    }
  });

  it('returns an empty array when the filter matches nothing', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      setupSchema(db);
      insertItem(db, { id: 'a', label: 'task' });

      const result = resolveBulkTargetIds(db, 'project-1', undefined, { label: 'feature' });
      expect(result).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('treats an empty itemIds array as absent and falls back to the filter', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      setupSchema(db);
      insertItem(db, { id: 'a', label: 'task' });

      const result = resolveBulkTargetIds(db, 'project-1', [], { label: 'task' });
      expect(result).toEqual(['a']);
    } finally {
      db.close();
    }
  });
});

describe('plan item tools', () => {
  let db: Database;
  let onPlanActions: ReturnType<typeof vi.fn>;
  let tools: ReturnType<typeof createPlanItemTools>;

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    setupSchema(db);
    dbHolder.current = db;
    onPlanActions = vi.fn();
    tools = createPlanItemTools(
      createFakePlanItemRepo(db),
      createFakePlanRelationRepo(db),
      onPlanActions as (actions: PlanAction[]) => void
    );
  });

  function getTool(name: string) {
    const found = tools.find((t) => t.name === name);
    if (!found) throw new Error(`tool not found: ${name}`);
    return found;
  }

  async function call(name: string, args: unknown): Promise<ToolCallResult> {
    return getTool(name).handler(args as never, undefined) as Promise<ToolCallResult>;
  }

  describe('query_plan_items', () => {
    it('flat format returns all items with child counts when no filters are given', async () => {
      insertItem(db, { id: 'root', itemOrder: 0 });
      insertItem(db, { id: 'child', parentId: 'root', itemOrder: 0 });

      const result = parseJson(await call('query_plan_items', { projectId: 'project-1' }));
      expect(result.count).toBe(2);
      const root = result.items.find((i: { id: string }) => i.id === 'root');
      expect(root.childCount).toBe(1);
    });

    it('flat format filters by label', async () => {
      insertItem(db, { id: 'a', label: 'task' });
      insertItem(db, { id: 'b', label: 'feature' });

      const result = parseJson(await call('query_plan_items', { projectId: 'project-1', label: 'task' }));
      expect(result.items.map((i: { id: string }) => i.id)).toEqual(['a']);
    });

    it('tree format with no filters equals the full hierarchy', async () => {
      insertItem(db, { id: 'root', itemOrder: 0 });
      insertItem(db, { id: 'child', parentId: 'root', itemOrder: 0 });
      insertItem(db, { id: 'grandchild', parentId: 'child', itemOrder: 0 });

      const result = parseJson(await call('query_plan_items', { projectId: 'project-1', format: 'tree' }));
      expect(result.tree).toHaveLength(1);
      expect(result.tree[0].id).toBe('root');
      expect(result.tree[0].children[0].id).toBe('child');
      expect(result.tree[0].children[0].children[0].id).toBe('grandchild');
      expect(result.totalItems).toBe(3);
    });

    it('tree format includes ancestors of matches so the tree stays coherent', async () => {
      insertItem(db, { id: 'root', itemOrder: 0, label: 'project' });
      insertItem(db, { id: 'child', parentId: 'root', itemOrder: 0, label: 'feature' });
      insertItem(db, { id: 'grandchild', parentId: 'child', itemOrder: 0, label: 'task' });
      insertItem(db, { id: 'unrelated', itemOrder: 1, label: 'task' });

      const result = parseJson(
        await call('query_plan_items', { projectId: 'project-1', label: 'task', format: 'tree' })
      );

      expect(result.matchedCount).toBe(2);
      // grandchild + unrelated matched; root/child pulled in only as ancestors of grandchild
      const rootNode = result.tree.find((n: { id: string }) => n.id === 'root');
      expect(rootNode).toBeDefined();
      expect(rootNode.children[0].id).toBe('child');
      expect(rootNode.children[0].children[0].id).toBe('grandchild');
      expect(result.tree.some((n: { id: string }) => n.id === 'unrelated')).toBe(true);
    });
  });

  describe('get_plan_items', () => {
    it('returns full item detail and reports notFound ids', async () => {
      insertItem(db, { id: 'a', title: 'Item A' });

      const result = parseJson(
        await call('get_plan_items', { projectId: 'project-1', itemIds: ['a', 'missing-id'] })
      );

      expect(result.count).toBe(1);
      expect(result.items[0].id).toBe('a');
      expect(result.items[0].title).toBe('Item A');
      expect(result.notFound).toEqual(['missing-id']);
    });

    it('include.parentTitle adds the parent title', async () => {
      insertItem(db, { id: 'root', title: 'Root Item' });
      insertItem(db, { id: 'child', parentId: 'root' });

      const result = parseJson(
        await call('get_plan_items', {
          projectId: 'project-1',
          itemIds: ['child'],
          include: { parentTitle: true },
        })
      );

      expect(result.items[0].parentTitle).toBe('Root Item');
    });

    it('include.children adds child summaries and descendant count', async () => {
      insertItem(db, { id: 'root' });
      insertItem(db, { id: 'child-1', parentId: 'root' });
      insertItem(db, { id: 'child-2', parentId: 'root' });
      insertItem(db, { id: 'grandchild', parentId: 'child-1' });

      const result = parseJson(
        await call('get_plan_items', {
          projectId: 'project-1',
          itemIds: ['root'],
          include: { children: true },
        })
      );

      expect(result.items[0].children).toHaveLength(2);
      expect(result.items[0].descendantCount).toBe(3);
    });

    it('include.dependencies adds blockedBy/blocks/relatedTo summaries', async () => {
      insertItem(db, { id: 'a', title: 'A' });
      insertItem(db, { id: 'b', title: 'B' });
      insertRelation(db, { id: 'rel-1', fromItemId: 'b', toItemId: 'a', relationType: 'blocks' });

      const result = parseJson(
        await call('get_plan_items', {
          projectId: 'project-1',
          itemIds: ['a'],
          include: { dependencies: true },
        })
      );

      expect(result.items[0].dependencies.blockedBy).toEqual([{ id: 'b', title: 'B', status: 'planned', external_key: null }]);
    });

    it('with all includes on a single id, reproduces get_item_context-equivalent info', async () => {
      insertItem(db, { id: 'root', title: 'Root' });
      insertItem(db, { id: 'target', parentId: 'root', title: 'Target' });
      insertItem(db, { id: 'child', parentId: 'target' });
      insertRelation(db, { id: 'rel-1', fromItemId: 'target', toItemId: 'root', relationType: 'relates_to' });

      const result = parseJson(
        await call('get_plan_items', {
          projectId: 'project-1',
          itemIds: ['target'],
          include: { parentTitle: true, children: true, dependencies: true },
        })
      );

      const item = result.items[0];
      expect(item.parentTitle).toBe('Root');
      expect(item.children).toHaveLength(1);
      expect(item.descendantCount).toBe(1);
      expect(item.dependencies.relatedTo).toHaveLength(1);
    });
  });

  describe('bulk_modify_plan', () => {
    it('rejects when neither itemIds nor filter is provided', async () => {
      const result = await call('bulk_modify_plan', {
        projectId: 'project-1',
        action: { type: 'delete' },
      });
      expect(result.isError).toBe(true);
    });

    it('rejects when both itemIds and filter are provided', async () => {
      insertItem(db, { id: 'a' });
      const result = await call('bulk_modify_plan', {
        projectId: 'project-1',
        itemIds: ['a'],
        filter: { label: 'task' },
        action: { type: 'delete' },
      });
      expect(result.isError).toBe(true);
    });

    it('rejects an empty filter object', async () => {
      const result = await call('bulk_modify_plan', {
        projectId: 'project-1',
        filter: {},
        action: { type: 'delete' },
      });
      expect(result.isError).toBe(true);
    });

    it('set_status emits update_item actions with the new statusCategory', async () => {
      insertItem(db, { id: 'a' });
      insertItem(db, { id: 'b' });

      await call('bulk_modify_plan', {
        projectId: 'project-1',
        itemIds: ['a', 'b'],
        action: { type: 'set_status', statusCategory: 'done' },
      });

      const actions = onPlanActions.mock.calls[0][0] as PlanAction[];
      expect(actions).toEqual([
        { type: 'update_item', item_id: 'a', updates: { status_category: 'done' } },
        { type: 'update_item', item_id: 'b', updates: { status_category: 'done' } },
      ]);
    });

    it('set_status resolves targets via filter', async () => {
      insertItem(db, { id: 'a', statusCategory: 'not_started' });
      insertItem(db, { id: 'b', statusCategory: 'in_progress' });

      await call('bulk_modify_plan', {
        projectId: 'project-1',
        filter: { statusCategory: 'not_started' },
        action: { type: 'set_status', statusCategory: 'in_progress' },
      });

      const actions = onPlanActions.mock.calls[0][0] as PlanAction[];
      expect(actions).toEqual([{ type: 'update_item', item_id: 'a', updates: { status_category: 'in_progress' } }]);
    });

    it('set_label emits set_label actions', async () => {
      insertItem(db, { id: 'a' });

      await call('bulk_modify_plan', {
        projectId: 'project-1',
        itemIds: ['a'],
        action: { type: 'set_label', label: 'feature' },
      });

      const actions = onPlanActions.mock.calls[0][0] as PlanAction[];
      expect(actions).toEqual([{ type: 'set_label', item_id: 'a', label: 'feature' }]);
    });

    it('set_release emits set_release actions, including null to clear', async () => {
      insertItem(db, { id: 'a' });

      await call('bulk_modify_plan', {
        projectId: 'project-1',
        itemIds: ['a'],
        action: { type: 'set_release', releaseTag: null },
      });

      const actions = onPlanActions.mock.calls[0][0] as PlanAction[];
      expect(actions).toEqual([{ type: 'set_release', item_id: 'a', release_tag: null }]);
    });

    it('reparent emits reparent actions targeting the new parent', async () => {
      insertItem(db, { id: 'a' });
      insertItem(db, { id: 'parent' });

      await call('bulk_modify_plan', {
        projectId: 'project-1',
        itemIds: ['a'],
        action: { type: 'reparent', newParentId: 'parent' },
      });

      const actions = onPlanActions.mock.calls[0][0] as PlanAction[];
      expect(actions).toEqual([{ type: 'reparent', item_id: 'a', new_parent_id: 'parent' }]);
    });

    it('reparent to root skips Jira subtasks whose parent link mirrors the tracker hierarchy', async () => {
      insertItem(db, { id: 'jira-parent', externalKey: 'PROJ-1' });
      insertItem(db, { id: 'jira-subtask', parentId: 'jira-parent', externalKey: 'PROJ-2', externalParentKey: 'PROJ-1' });
      insertItem(db, { id: 'local-child', parentId: 'jira-parent' });

      const result = parseJson(
        await call('bulk_modify_plan', {
          projectId: 'project-1',
          itemIds: ['jira-subtask', 'local-child'],
          action: { type: 'reparent', newParentId: null },
        })
      );

      const actions = onPlanActions.mock.calls[0][0] as PlanAction[];
      expect(actions).toEqual([{ type: 'reparent', item_id: 'local-child', new_parent_id: null }]);
      expect(result.skippedJiraSubtasks).toBe(1);
    });

    it('delete emits delete_item actions for selected ids and reports descendant total', async () => {
      insertItem(db, { id: 'parent' });
      insertItem(db, { id: 'child', parentId: 'parent' });
      insertItem(db, { id: 'grandchild', parentId: 'child' });

      const result = parseJson(
        await call('bulk_modify_plan', {
          projectId: 'project-1',
          itemIds: ['parent'],
          action: { type: 'delete' },
        })
      );

      const actions = onPlanActions.mock.calls[0][0] as PlanAction[];
      expect(actions).toEqual([{ type: 'delete_item', item_id: 'parent' }]);
      expect(result.totalAffected).toBe(3);
    });

    it('clear_dependencies emits remove_dependency actions honoring direction', async () => {
      insertItem(db, { id: 'a' });
      insertItem(db, { id: 'b' });
      insertRelation(db, { id: 'rel-in', fromItemId: 'b', toItemId: 'a', relationType: 'blocks' });
      insertRelation(db, { id: 'rel-out', fromItemId: 'a', toItemId: 'b', relationType: 'relates_to' });

      await call('bulk_modify_plan', {
        projectId: 'project-1',
        itemIds: ['a'],
        action: { type: 'clear_dependencies', direction: 'incoming' },
      });

      const actions = onPlanActions.mock.calls[0][0] as PlanAction[];
      expect(actions).toEqual([{ type: 'remove_dependency', relation_id: 'rel-in' }]);
    });

    it('flatten equivalence: hasParent filter + reparent(null) matches itemIds-based reparent(null) for the same set', async () => {
      insertItem(db, { id: 'root' });
      insertItem(db, { id: 'nested-1', parentId: 'root' });
      insertItem(db, { id: 'nested-2', parentId: 'root' });

      await call('bulk_modify_plan', {
        projectId: 'project-1',
        filter: { hasParent: true },
        action: { type: 'reparent', newParentId: null },
      });

      const viaFilter = (onPlanActions.mock.calls[0][0] as PlanAction[])
        .slice()
        .sort((x, y) => ('item_id' in x && 'item_id' in y ? x.item_id.localeCompare(y.item_id) : 0));

      onPlanActions.mockClear();

      await call('bulk_modify_plan', {
        projectId: 'project-1',
        itemIds: ['nested-1', 'nested-2'],
        action: { type: 'reparent', newParentId: null },
      });

      const viaItemIds = (onPlanActions.mock.calls[0][0] as PlanAction[])
        .slice()
        .sort((x, y) => ('item_id' in x && 'item_id' in y ? x.item_id.localeCompare(y.item_id) : 0));

      expect(viaFilter).toEqual(viaItemIds);
      expect(viaFilter).toEqual([
        { type: 'reparent', item_id: 'nested-1', new_parent_id: null },
        { type: 'reparent', item_id: 'nested-2', new_parent_id: null },
      ]);
    });

    it('reports no items matched when the filter matches nothing', async () => {
      const result = parseJson(
        await call('bulk_modify_plan', {
          projectId: 'project-1',
          filter: { label: 'task' },
          action: { type: 'delete' },
        })
      );
      expect(result.count).toBe(0);
      expect(onPlanActions).not.toHaveBeenCalled();
    });
  });
});
