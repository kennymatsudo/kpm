/**
 * Plan Item Repository Implementation - Dependency Injection Version
 */

import type { Database, Statement } from 'better-sqlite3';
import type { PlanItem, PlanItemUpdates, PlanItemSyncUpdates, NewPlanItem } from '../../../../shared/types';
import type { IPlanItemRepository } from '../../interfaces';
import { PLAN_ITEM_FIELDS, isJsonEncodedKind, type PlanItemFieldName, type PlanItemFieldDescriptor } from '../../../../shared/planItemFields';

/**
 * Safely parse a JSON-encoded string[] column. Returns null on parse failure.
 */
function parseStringArray(json: string | null): string[] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Transform raw database row to PlanItem with proper typing
 */
function rowToPlanItem(row: Record<string, unknown>): PlanItem {
  const jsonDecodedFields: Record<string, string[] | null> = {};
  for (const name of Object.keys(PLAN_ITEM_FIELDS) as PlanItemFieldName[]) {
    const descriptor = PLAN_ITEM_FIELDS[name];
    if (isJsonEncodedKind(descriptor.fieldKind)) {
      jsonDecodedFields[descriptor.sqlColumn] = parseStringArray(row[descriptor.sqlColumn] as string | null);
    }
  }
  return {
    ...row,
    ...jsonDecodedFields,
    intent: (row.intent as string | null) ?? null,
    source_document_id: (row.source_document_id as string | null) ?? null,
    status: (row.status as 'backlog' | 'planned') || 'planned',
    group_id: row.group_id as string | null ?? null,
  } as PlanItem;
}

/** Encode a registry-field value for binding: JSON-encoded kinds are stringified, empty to NULL. */
function encodeFieldValue(descriptor: PlanItemFieldDescriptor, value: unknown): unknown {
  return isJsonEncodedKind(descriptor.fieldKind) ? (value ? JSON.stringify(value) : null) : value;
}

interface InsertColumn {
  column: string;
  bind: (item: NewPlanItem) => unknown;
}

/**
 * Ordered column list for the `plan_items` INSERT. Order within this array is
 * the single source of truth for both the SQL column list and the bind
 * values — see the `insert` prepared statement and `add()` below.
 */
const INSERT_COLUMNS: readonly InsertColumn[] = [
  // Identity
  { column: 'id', bind: (item) => item.id },
  { column: 'project_id', bind: (item) => item.project_id },

  // Registry-derived (src/shared/planItemFields.ts)
  ...(Object.keys(PLAN_ITEM_FIELDS) as PlanItemFieldName[]).map((name): InsertColumn => {
    const descriptor = PLAN_ITEM_FIELDS[name];
    if (name === 'status') {
      return { column: descriptor.sqlColumn, bind: (item) => item.status ?? 'planned' };
    }
    return { column: descriptor.sqlColumn, bind: (item) => encodeFieldValue(descriptor, item[name]) ?? null };
  }),

  // Sync/external columns — deliberately outside the registry (separate
  // ownership domain, see planItemFields.ts), unioned in at the column layer.
  { column: 'association_id', bind: (item) => item.association_id ?? null },
  { column: 'external_key', bind: (item) => item.external_key ?? null },
  { column: 'external_id', bind: (item) => item.external_id ?? null },
  { column: 'external_type', bind: (item) => item.external_type ?? null },
  { column: 'external_issue_type', bind: (item) => item.external_issue_type ?? null },
  { column: 'external_status', bind: (item) => item.external_status ?? null },
  { column: 'external_url', bind: (item) => item.external_url ?? null },
  { column: 'external_parent_key', bind: (item) => item.external_parent_key ?? null },
  { column: 'external_epic_key', bind: (item) => item.external_epic_key ?? null },
  { column: 'external_assignee_id', bind: (item) => item.external_assignee_id ?? null },
  { column: 'external_assignee_name', bind: (item) => item.external_assignee_name ?? null },
  { column: 'external_assignee_avatar_url', bind: (item) => item.external_assignee_avatar_url ?? null },
  { column: 'external_creator_id', bind: (item) => item.external_creator_id ?? null },
  { column: 'external_creator_name', bind: (item) => item.external_creator_name ?? null },
  { column: 'external_creator_avatar_url', bind: (item) => item.external_creator_avatar_url ?? null },
  { column: 'sync_source', bind: (item) => item.sync_source ?? 'local' },
  { column: 'last_synced_at', bind: (item) => item.last_synced_at ?? null },
];

/**
 * Prepared statements cache for hot paths.
 * Statements are prepared once at construction to avoid repeated parsing overhead.
 */
interface PreparedStatements {
  // Read operations
  getByProject: Statement;
  getById: Statement;
  getChildCount: Statement;
  getNextOrderWithParent: Statement;
  getNextOrderNoParent: Statement;
  collectDescendants: Statement;
  // Children by parent (without filter)
  getChildrenByParent: Statement;
  // Siblings (4 variants based on parentId and excludeId combinations)
  siblingsWithParentWithExclude: Statement;
  siblingsWithParentNoExclude: Statement;
  siblingsNoParentWithExclude: Statement;
  siblingsNoParentNoExclude: Statement;

  // Write operations
  insert: Statement;
  deleteById: Statement;
  updatePosition: Statement;
  reparent: Statement;
}

export class PlanItemRepository implements IPlanItemRepository {
  private stmts: PreparedStatements;
  /**
   * One single-field UPDATE per registry field, keyed by field name.
   * `status_category` is excluded — it needs the completed_at CASE on the
   * slow path, so single-key updates to it fall through to update()'s
   * dynamic SQL instead of using this map.
   */
  private singleFieldUpdate: Map<PlanItemFieldName, Statement>;

  constructor(private db: Database) {
    this.singleFieldUpdate = new Map();
    for (const name of Object.keys(PLAN_ITEM_FIELDS) as PlanItemFieldName[]) {
      if (name === 'status_category') continue;
      const descriptor = PLAN_ITEM_FIELDS[name];
      this.singleFieldUpdate.set(
        name,
        db.prepare(`UPDATE plan_items SET ${descriptor.sqlColumn} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      );
    }

    // Prepare statements once for hot paths
    this.stmts = {
      // Read operations
      getByProject: db.prepare(`
        SELECT * FROM plan_items WHERE project_id = ? ORDER BY item_order
      `),
      getById: db.prepare('SELECT * FROM plan_items WHERE id = ?'),
      getChildCount: db.prepare('SELECT COUNT(*) as count FROM plan_items WHERE parent_id = ?'),
      getNextOrderWithParent: db.prepare(`
        SELECT MAX(item_order) as max_order FROM plan_items
        WHERE project_id = ? AND parent_id = ?
      `),
      getNextOrderNoParent: db.prepare(`
        SELECT MAX(item_order) as max_order FROM plan_items
        WHERE project_id = ? AND parent_id IS NULL
      `),
      collectDescendants: db.prepare(`
        WITH RECURSIVE descendants(id) AS (
          SELECT id FROM plan_items WHERE parent_id = ?
          UNION ALL
          SELECT p.id FROM plan_items p
          JOIN descendants d ON p.parent_id = d.id
        )
        SELECT id FROM descendants
      `),
      getChildrenByParent: db.prepare(`
        SELECT * FROM plan_items
        WHERE project_id = ? AND parent_id = ?
        ORDER BY item_order
      `),
      // Siblings: 4 variants for all combinations of parentId/excludeId
      siblingsWithParentWithExclude: db.prepare(`
        SELECT id, item_order FROM plan_items
        WHERE project_id = ? AND parent_id = ? AND id != ?
        ORDER BY item_order
      `),
      siblingsWithParentNoExclude: db.prepare(`
        SELECT id, item_order FROM plan_items
        WHERE project_id = ? AND parent_id = ?
        ORDER BY item_order
      `),
      siblingsNoParentWithExclude: db.prepare(`
        SELECT id, item_order FROM plan_items
        WHERE project_id = ? AND parent_id IS NULL AND id != ?
        ORDER BY item_order
      `),
      siblingsNoParentNoExclude: db.prepare(`
        SELECT id, item_order FROM plan_items
        WHERE project_id = ? AND parent_id IS NULL
        ORDER BY item_order
      `),

      // Write operations - use RETURNING to avoid re-query
      insert: db.prepare(`
        INSERT INTO plan_items (${INSERT_COLUMNS.map((c) => c.column).join(', ')})
        VALUES (${INSERT_COLUMNS.map(() => '?').join(', ')})
        RETURNING *
      `),
      deleteById: db.prepare('DELETE FROM plan_items WHERE id = ?'),
      updatePosition: db.prepare(`
        UPDATE plan_items SET position_x = ?, position_y = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `),
      reparent: db.prepare(`
        UPDATE plan_items SET parent_id = ?, status = 'planned', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `),
    };
  }

  /**
   * Collect all descendant IDs for a given parent using recursive CTE.
   * Single query instead of O(depth) queries for hierarchical traversal.
   */
  private collectDescendantIds(parentId: string): string[] {
    const rows = this.stmts.collectDescendants.all(parentId) as { id: string }[];
    return rows.map(r => r.id);
  }

  getByProject(projectId: string): PlanItem[] {
    const rows = this.stmts.getByProject.all(projectId) as Record<string, unknown>[];
    return rows.map(rowToPlanItem);
  }

  get(id: string): PlanItem | undefined {
    const row = this.stmts.getById.get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return rowToPlanItem(row);
  }

  getMany(ids: string[]): PlanItem[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const stmt = this.db.prepare(`SELECT * FROM plan_items WHERE id IN (${placeholders})`);
    const rows = stmt.all(...ids) as Record<string, unknown>[];
    return rows.map(rowToPlanItem);
  }

  getExistingIds(ids: string[]): Set<string> {
    if (ids.length === 0) return new Set();
    const placeholders = ids.map(() => '?').join(',');
    const stmt = this.db.prepare(`SELECT id FROM plan_items WHERE id IN (${placeholders})`);
    const rows = stmt.all(...ids) as { id: string }[];
    return new Set(rows.map((r) => r.id));
  }

  add(item: NewPlanItem): PlanItem {
    // Use RETURNING to get the inserted row in one query (no re-query needed)
    const row = this.stmts.insert.get(...INSERT_COLUMNS.map((c) => c.bind(item))) as Record<string, unknown>;
    return rowToPlanItem(row);
  }

  update(id: string, updates: PlanItemUpdates | PlanItemSyncUpdates): void {
    // Fast path: use cached statements for single-field updates (most common case)
    const keys = Object.keys(updates).filter(k => (updates as Record<string, unknown>)[k] !== undefined);

    if (keys.length === 1) {
      const key = keys[0] as PlanItemFieldName;
      const stmt = this.singleFieldUpdate.get(key);
      if (stmt) {
        const value = (updates as Record<string, unknown>)[key];
        stmt.run(encodeFieldValue(PLAN_ITEM_FIELDS[key], value), id);
        return;
      }
      // status_category needs special handling for completed_at, fall through to dynamic
    }

    // Slow path: dynamic SQL for multi-field updates or special cases
    const fields: string[] = [];
    const values: unknown[] = [];

    // Base PlanItemUpdates fields, generated from the registry so a new
    // field only needs an entry in src/shared/planItemFields.ts.
    const updatesRecord = updates as Record<string, unknown>;
    for (const name of Object.keys(PLAN_ITEM_FIELDS) as PlanItemFieldName[]) {
      const value = updatesRecord[name];
      if (value === undefined) continue;

      const descriptor = PLAN_ITEM_FIELDS[name];
      fields.push(`${descriptor.sqlColumn} = ?`);
      values.push(encodeFieldValue(descriptor, value));
    }

    if (updates.status_category !== undefined) {
      // Track completion timestamp when item is marked as done. Use a SQL CASE
      // against the OLD status_category instead of a pre-read SELECT: SQLite
      // evaluates every SET expression against the pre-update row values, so
      // the CASE correctly distinguishes "already done" from "transitioning
      // into done" without an extra round trip.
      if (updates.status_category === 'done') {
        fields.push("completed_at = CASE WHEN status_category != 'done' THEN CURRENT_TIMESTAMP ELSE completed_at END");
      } else if (updates.status_category !== null) {
        // Clear completed_at if moving away from done state
        fields.push('completed_at = NULL');
      }
    }

    // Extended PlanItemSyncUpdates fields (for sync operations)
    const syncUpdates = updates as PlanItemSyncUpdates;
    if (syncUpdates.external_key !== undefined) {
      fields.push('external_key = ?');
      values.push(syncUpdates.external_key);
    }
    if (syncUpdates.external_id !== undefined) {
      fields.push('external_id = ?');
      values.push(syncUpdates.external_id);
    }
    if (syncUpdates.external_type !== undefined) {
      fields.push('external_type = ?');
      values.push(syncUpdates.external_type);
    }
    if (syncUpdates.external_status !== undefined) {
      fields.push('external_status = ?');
      values.push(syncUpdates.external_status);
    }
    if (syncUpdates.external_url !== undefined) {
      fields.push('external_url = ?');
      values.push(syncUpdates.external_url);
    }
    if (syncUpdates.external_assignee_id !== undefined) {
      fields.push('external_assignee_id = ?');
      values.push(syncUpdates.external_assignee_id);
    }
    if (syncUpdates.external_assignee_name !== undefined) {
      fields.push('external_assignee_name = ?');
      values.push(syncUpdates.external_assignee_name);
    }
    if (syncUpdates.external_assignee_avatar_url !== undefined) {
      fields.push('external_assignee_avatar_url = ?');
      values.push(syncUpdates.external_assignee_avatar_url);
    }
    if (syncUpdates.external_creator_id !== undefined) {
      fields.push('external_creator_id = ?');
      values.push(syncUpdates.external_creator_id);
    }
    if (syncUpdates.external_creator_name !== undefined) {
      fields.push('external_creator_name = ?');
      values.push(syncUpdates.external_creator_name);
    }
    if (syncUpdates.external_creator_avatar_url !== undefined) {
      fields.push('external_creator_avatar_url = ?');
      values.push(syncUpdates.external_creator_avatar_url);
    }
    if (syncUpdates.association_id !== undefined) {
      fields.push('association_id = ?');
      values.push(syncUpdates.association_id);
    }
    if (syncUpdates.sync_source !== undefined) {
      fields.push('sync_source = ?');
      values.push(syncUpdates.sync_source);
    }
    if (syncUpdates.last_synced_at !== undefined) {
      fields.push('last_synced_at = ?');
      values.push(syncUpdates.last_synced_at);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE plan_items SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);
  }

  delete(id: string): void {
    const transaction = this.db.transaction(() => {
      const descendantIds = this.collectDescendantIds(id);

      if (descendantIds.length > 0) {
        // Orphan all descendants (parent_id=null, keep status as 'planned')
        const placeholders = descendantIds.map(() => '?').join(',');
        const updateDescendants = this.db.prepare(
          `UPDATE plan_items SET parent_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`
        );
        updateDescendants.run(...descendantIds);
      }

      // Delete the item
      this.stmts.deleteById.run(id);
    });
    transaction();
  }

  deleteWithDescendants(id: string): void {
    const transaction = this.db.transaction(() => {
      const descendantIds = this.collectDescendantIds(id);
      const allIds = [id, ...descendantIds];

      // Delete all items (parent + all descendants)
      const placeholders = allIds.map(() => '?').join(',');
      const deleteStmt = this.db.prepare(`DELETE FROM plan_items WHERE id IN (${placeholders})`);
      deleteStmt.run(...allIds);
    });
    transaction();
  }

  getChildCount(itemId: string): number {
    const result = this.stmts.getChildCount.get(itemId) as { count: number };
    return result.count;
  }

  updatePosition(itemId: string, x: number, y: number): void {
    this.stmts.updatePosition.run(x, y, itemId);
  }

  batchUpdatePositions(updates: { id: string; x: number; y: number }[]): void {
    if (updates.length === 0) return;
    const transaction = this.db.transaction((entries: { id: string; x: number; y: number }[]) => {
      for (const entry of entries) {
        this.stmts.updatePosition.run(entry.x, entry.y, entry.id);
      }
    });
    transaction(updates);
  }

  getNextOrder(projectId: string, parentId: string | null): number {
    const result = parentId
      ? this.stmts.getNextOrderWithParent.get(projectId, parentId) as { max_order: number | null }
      : this.stmts.getNextOrderNoParent.get(projectId) as { max_order: number | null };
    return (result?.max_order ?? -1) + 1;
  }

  /**
   * Get children of a specific parent, optionally filtered by external issue types.
   * Uses cached statement for the common case (no filter).
   */
  getChildrenByParent(
    projectId: string,
    parentId: string,
    externalIssueTypes?: string[]
  ): PlanItem[] {
    // Slow path: dynamic query with IN clause (unavoidable for variable-length filter)
    if (externalIssueTypes && externalIssueTypes.length > 0) {
      const placeholders = externalIssueTypes.map(() => '?').join(',');
      const stmt = this.db.prepare(`
        SELECT * FROM plan_items
        WHERE project_id = ? AND parent_id = ? AND external_issue_type IN (${placeholders})
        ORDER BY item_order
      `);
      const rows = stmt.all(projectId, parentId, ...externalIssueTypes) as Record<string, unknown>[];
      return rows.map(rowToPlanItem);
    }

    // Fast path: use cached statement
    const rows = this.stmts.getChildrenByParent.all(projectId, parentId) as Record<string, unknown>[];
    return rows.map(rowToPlanItem);
  }

  /**
   * Get siblings of an item (same parent), returning only id and item_order.
   * Uses cached statements for all 4 variants (parentId × excludeId combinations).
   */
  getSiblings(
    projectId: string,
    parentId: string | null,
    excludeId?: string
  ): { id: string; item_order: number }[] {
    if (parentId && excludeId) {
      return this.stmts.siblingsWithParentWithExclude.all(projectId, parentId, excludeId) as { id: string; item_order: number }[];
    } else if (parentId) {
      return this.stmts.siblingsWithParentNoExclude.all(projectId, parentId) as { id: string; item_order: number }[];
    } else if (excludeId) {
      return this.stmts.siblingsNoParentWithExclude.all(projectId, excludeId) as { id: string; item_order: number }[];
    }
    return this.stmts.siblingsNoParentNoExclude.all(projectId) as { id: string; item_order: number }[];
  }

  batchUpdateStatus(ids: string[], status: string): void {
    if (ids.length === 0) return;
    const stmt = this.singleFieldUpdate.get('status')!;
    const transaction = this.db.transaction(() => {
      for (const id of ids) {
        stmt.run(status, id);
      }
    });
    transaction();
  }

  /**
   * Batch reparent multiple items efficiently.
   * Uses a single pre-prepared statement, binding once per item.
   * Much faster than calling update() N times (avoids N statement preparations).
   */
  batchReparent(updates: { id: string; parentId: string | null }[]): string[] {
    if (updates.length === 0) return [];

    const updatedIds: string[] = [];
    for (const { id, parentId } of updates) {
      const info = this.stmts.reparent.run(parentId, id);
      if (info.changes > 0) {
        updatedIds.push(id);
      }
    }
    return updatedIds;
  }
}
