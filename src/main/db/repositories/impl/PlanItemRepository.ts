/**
 * Plan Item Repository Implementation - Dependency Injection Version
 */

import type { Database, Statement } from 'better-sqlite3';
import type { PlanItem, PlanItemUpdates, PlanItemSyncUpdates } from '../../../../shared/types';
import type { IPlanItemRepository } from '../../interfaces';

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
  return {
    ...row,
    code_refs: parseStringArray(row.code_refs as string | null),
    acceptance_criteria: parseStringArray(row.acceptance_criteria as string | null),
    intent: (row.intent as string | null) ?? null,
    source_document_id: (row.source_document_id as string | null) ?? null,
    status: (row.status as 'backlog' | 'planned') || 'planned',
    group_id: row.group_id as string | null ?? null,
  } as PlanItem;
}

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

  // Common update patterns (optimized for frequent operations)
  updateTitle: Statement;
  updateDescription: Statement;
  updateLabel: Statement;
  updateStatus: Statement;
  updateStatusCategory: Statement;
  updateItemOrder: Statement;
  updateReleaseTag: Statement;
}

export class PlanItemRepository implements IPlanItemRepository {
  private stmts: PreparedStatements;

  constructor(private db: Database) {
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
        INSERT INTO plan_items (
          id, project_id, parent_id, title, description, label, item_order,
          code_refs, status, status_category, release_tag, position_x, position_y,
          association_id, external_key, external_id, external_type, external_issue_type,
          external_status, external_url, external_parent_key, external_epic_key,
          sync_source, last_synced_at, group_id,
          intent, acceptance_criteria, source_document_id
        )
        RETURNING *
      `),
      deleteById: db.prepare('DELETE FROM plan_items WHERE id = ?'),
      updatePosition: db.prepare(`
        UPDATE plan_items SET position_x = ?, position_y = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `),
      reparent: db.prepare(`
        UPDATE plan_items SET parent_id = ?, status = 'planned', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `),

      // Common single-field update patterns
      updateTitle: db.prepare(`
        UPDATE plan_items SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `),
      updateDescription: db.prepare(`
        UPDATE plan_items SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `),
      updateLabel: db.prepare(`
        UPDATE plan_items SET label = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `),
      updateStatus: db.prepare(`
        UPDATE plan_items SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `),
      updateStatusCategory: db.prepare(`
        UPDATE plan_items SET status_category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `),
      updateItemOrder: db.prepare(`
        UPDATE plan_items SET item_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `),
      updateReleaseTag: db.prepare(`
        UPDATE plan_items SET release_tag = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
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

  add(item: Omit<PlanItem, 'created_at' | 'updated_at'>): PlanItem {
    // Use RETURNING to get the inserted row in one query (no re-query needed)
    const row = this.stmts.insert.get(
      item.id,
      item.project_id,
      item.parent_id,
      item.title,
      item.description,
      item.label,
      item.item_order,
      item.code_refs ? JSON.stringify(item.code_refs) : null,
      item.status || 'planned',
      item.status_category ?? null,
      item.release_tag,
      item.position_x,
      item.position_y,
      item.association_id ?? null,
      item.external_key ?? null,
      item.external_id ?? null,
      item.external_type ?? null,
      item.external_issue_type ?? null,
      item.external_status ?? null,
      item.external_url ?? null,
      item.external_parent_key ?? null,
      item.external_epic_key ?? null,
      item.sync_source ?? 'local',
      item.last_synced_at ?? null,
      item.group_id ?? null,
      item.intent ?? null,
      item.acceptance_criteria ? JSON.stringify(item.acceptance_criteria) : null,
      item.source_document_id ?? null
    ) as Record<string, unknown>;
    return rowToPlanItem(row);
  }

  update(id: string, updates: PlanItemUpdates | PlanItemSyncUpdates): void {
    // Fast path: use cached statements for single-field updates (most common case)
    const keys = Object.keys(updates).filter(k => (updates as Record<string, unknown>)[k] !== undefined);

    if (keys.length === 1) {
      const key = keys[0];
      const value = (updates as Record<string, unknown>)[key];

      switch (key) {
        case 'title':
          this.stmts.updateTitle.run(value, id);
          return;
        case 'description':
          this.stmts.updateDescription.run(value, id);
          return;
        case 'label':
          this.stmts.updateLabel.run(value, id);
          return;
        case 'status':
          this.stmts.updateStatus.run(value, id);
          return;
        case 'item_order':
          this.stmts.updateItemOrder.run(value, id);
          return;
        case 'release_tag':
          this.stmts.updateReleaseTag.run(value, id);
          return;
        // status_category needs special handling for completed_at, fall through to dynamic
      }
    }

    // Slow path: dynamic SQL for multi-field updates or special cases
    const fields: string[] = [];
    const values: unknown[] = [];

    // Base PlanItemUpdates fields
    if (updates.parent_id !== undefined) {
      fields.push('parent_id = ?');
      values.push(updates.parent_id);
    }
    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.label !== undefined) {
      fields.push('label = ?');
      values.push(updates.label);
    }
    if (updates.item_order !== undefined) {
      fields.push('item_order = ?');
      values.push(updates.item_order);
    }
    if (updates.code_refs !== undefined) {
      fields.push('code_refs = ?');
      values.push(updates.code_refs ? JSON.stringify(updates.code_refs) : null);
    }
    if (updates.intent !== undefined) {
      fields.push('intent = ?');
      values.push(updates.intent);
    }
    if (updates.acceptance_criteria !== undefined) {
      fields.push('acceptance_criteria = ?');
      values.push(updates.acceptance_criteria ? JSON.stringify(updates.acceptance_criteria) : null);
    }
    if (updates.source_document_id !== undefined) {
      fields.push('source_document_id = ?');
      values.push(updates.source_document_id);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.status_category !== undefined) {
      fields.push('status_category = ?');
      values.push(updates.status_category);

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
    if (updates.release_tag !== undefined) {
      fields.push('release_tag = ?');
      values.push(updates.release_tag);
    }
    if (updates.position_x !== undefined) {
      fields.push('position_x = ?');
      values.push(updates.position_x);
    }
    if (updates.position_y !== undefined) {
      fields.push('position_y = ?');
      values.push(updates.position_y);
    }
    if (updates.group_id !== undefined) {
      fields.push('group_id = ?');
      values.push(updates.group_id);
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
    const transaction = this.db.transaction(() => {
      for (const id of ids) {
        this.stmts.updateStatus.run(status, id);
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
