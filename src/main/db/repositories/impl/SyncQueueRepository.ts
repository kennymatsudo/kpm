/**
 * Sync Queue Repository Implementation - Dependency Injection Version
 *
 * Optimized with prepared statement caching and RETURNING clause.
 */

import type { Database, Statement } from 'better-sqlite3';
import type { ISyncQueueRepository } from '../../interfaces';

/**
 * Prepared statements cache for hot paths.
 */
interface PreparedStatements {
  // Read operations
  getById: Statement;
  getByProject: Statement;
  getByProjectWithPlanItems: Statement;
  getByPlanItem: Statement;
  getByAssociation: Statement;
  getQueueCount: Statement;

  // Write operations
  insert: Statement;
  remove: Statement;
  removeByPlanItem: Statement;
  clearProject: Statement;
  updateStatusCategory: Statement;
  updateResolvedType: Statement;
  setError: Statement;
}

export class SyncQueueRepository implements ISyncQueueRepository {
  private stmts: PreparedStatements;

  constructor(private db: Database) {
    // Column list for consistent SELECT queries
    const cols = `id, kpm_project_id, plan_item_id, association_id, operation,
             target_issue_type_id, target_issue_type_name, target_parent_key,

    this.stmts = {
      // Read operations
      getById: db.prepare(`SELECT ${cols} FROM sync_queue WHERE id = ?`),
      getByProject: db.prepare(`SELECT ${cols} FROM sync_queue WHERE kpm_project_id = ? ORDER BY queued_at`),
      getByProjectWithPlanItems: db.prepare(`
        SELECT
          sq.id, sq.kpm_project_id, sq.plan_item_id, sq.association_id, sq.operation,
          sq.target_issue_type_id, sq.target_issue_type_name, sq.target_parent_key,
          pi.title as plan_item_title,
          pi.description as plan_item_description,
          pi.label as plan_item_label,
          pi.parent_id as plan_item_parent_id,
          pi.external_key as plan_item_external_key,
          pi.external_type as plan_item_external_type
        FROM sync_queue sq
        JOIN plan_items pi ON sq.plan_item_id = pi.id
        WHERE sq.kpm_project_id = ?
        ORDER BY sq.queued_at
      `),
      getByPlanItem: db.prepare(`SELECT ${cols} FROM sync_queue WHERE plan_item_id = ?`),
      getByAssociation: db.prepare(`SELECT ${cols} FROM sync_queue WHERE association_id = ? ORDER BY queued_at`),

      // Write operations - use RETURNING to avoid re-query
      insert: db.prepare(`
        RETURNING ${cols}
      `),
      remove: db.prepare('DELETE FROM sync_queue WHERE id = ?'),
      removeByPlanItem: db.prepare('DELETE FROM sync_queue WHERE plan_item_id = ?'),
      clearProject: db.prepare('DELETE FROM sync_queue WHERE kpm_project_id = ?'),
      updateStatusCategory: db.prepare(`UPDATE sync_queue SET target_status_category = ? WHERE id = ?`),
      updateResolvedType: db.prepare(`
        UPDATE sync_queue
        SET target_issue_type_id = ?, target_issue_type_name = ?, target_parent_key = ?
        WHERE id = ?
      `),
      setError: db.prepare(`UPDATE sync_queue SET error_message = ? WHERE id = ?`),
    };
  }

  getByProject(projectId: string): SyncQueueEntry[] {
  }

  getByProjectWithPlanItems(projectId: string): SyncQueueEntryWithPlanItem[] {
      plan_item_title: string;
      plan_item_description: string | null;
      plan_item_label: string | null;
      plan_item_parent_id: string | null;
      plan_item_external_key: string | null;
      plan_item_external_type: string | null;
    })[];

    return rows.map(row => ({
      id: row.id,
      kpm_project_id: row.kpm_project_id,
      plan_item_id: row.plan_item_id,
      association_id: row.association_id,
      operation: row.operation,
      target_issue_type_id: row.target_issue_type_id,
      target_issue_type_name: row.target_issue_type_name,
      target_parent_key: row.target_parent_key,
      target_status_category: row.target_status_category,
      queued_by: row.queued_by,
      queued_at: row.queued_at,
      error_message: row.error_message,
      plan_item: {
        id: row.plan_item_id,
        title: row.plan_item_title,
        description: row.plan_item_description,
        label: row.plan_item_label,
        parent_id: row.plan_item_parent_id,
        external_key: row.plan_item_external_key,
        external_type: row.plan_item_external_type,
      },
    }));
  }

  getByPlanItem(planItemId: string): SyncQueueEntry | undefined {
  }

  getByItemId(planItemId: string): SyncQueueEntry | undefined {
    return this.getByPlanItem(planItemId);
  }

  getByAssociation(associationId: string): SyncQueueEntry[] {
  }

  getQueuedItemsWithPlanData(projectId: string): SyncQueueEntryWithPlanItem[] {
    return this.getByProjectWithPlanItems(projectId);
  }

  getQueueCount(projectId: string): number {
    const result = this.stmts.getQueueCount.get(projectId) as { count: number };
    return result.count;
  }

  // Overload signatures to match interface
  add(projectId: string, planItemId: string, associationId: string, operation: 'create' | 'update', queuedBy: 'user' | 'claude'): SyncQueueEntry | null;
  add(
    planItemId?: string,
    associationId?: string,
    operation?: 'create' | 'update',
    queuedBy?: 'user' | 'claude'
  ): SyncQueueEntry | null {
    // Handle overloaded signature

    if (typeof entryOrProjectId === 'string') {
      entry = {
        kpm_project_id: entryOrProjectId,
        plan_item_id: planItemId!,
        association_id: associationId!,
        operation: operation!,
        queued_by: queuedBy!,
      };
    } else {
      entry = entryOrProjectId;
    }

    // Check if already queued
    const existing = this.getByPlanItem(entry.plan_item_id);
    if (existing) {
      return typeof entryOrProjectId === 'string' ? null : existing;
    }

    // Use RETURNING to get inserted row in one query
      id,
      entry.kpm_project_id,
      entry.plan_item_id,
      entry.association_id,
      entry.operation,
      entry.queued_by
  }

  get(id: string): SyncQueueEntry | undefined {
  }

    // Dynamic update for multi-field changes (less common path)
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.target_issue_type_id !== undefined) {
      fields.push('target_issue_type_id = ?');
      values.push(updates.target_issue_type_id);
    }
    if (updates.target_issue_type_name !== undefined) {
      fields.push('target_issue_type_name = ?');
      values.push(updates.target_issue_type_name);
    }
    if (updates.target_parent_key !== undefined) {
      fields.push('target_parent_key = ?');
      values.push(updates.target_parent_key);
    }
    if (updates.target_status_category !== undefined) {
      fields.push('target_status_category = ?');
      values.push(updates.target_status_category);
    }
    if (updates.error_message !== undefined) {
      fields.push('error_message = ?');
      values.push(updates.error_message);
    }

    if (fields.length === 0) return;

    values.push(id);
    const stmt = this.db.prepare(`UPDATE sync_queue SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  remove(id: string): void {
    this.stmts.remove.run(id);
  }

  removeByPlanItem(planItemId: string): void {
    this.stmts.removeByPlanItem.run(planItemId);
  }

  removeByProject(projectId: string): void {
    this.clearProject(projectId);
  }

  clearProject(projectId: string): void {
    this.stmts.clearProject.run(projectId);
  }

  updateStatusCategory(id: string, statusCategory: string | null): void {
    this.stmts.updateStatusCategory.run(statusCategory, id);
  }

  updateResolvedType(id: string, typeId: string, typeName: string, parentKey: string | null): void {
    this.stmts.updateResolvedType.run(typeId, typeName, parentKey, id);
  }

  setError(id: string, errorMessage: string): void {
    this.stmts.setError.run(errorMessage, id);
  }
}
