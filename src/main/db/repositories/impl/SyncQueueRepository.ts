/**
 * Sync Queue Repository Implementation - Dependency Injection Version
 *
 * Optimized with prepared statement caching and RETURNING clause.
 */

import type { Database, Statement } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { CustomFieldValues, SyncQueueEntry, SyncQueueEntryWithPlanItem } from '../../../../shared/types';
import type { ISyncQueueRepository } from '../../interfaces';

function parseCustomFieldOverrides(raw: string | null): CustomFieldValues | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    const overrides: CustomFieldValues = {};
    for (const [fieldId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') {
        overrides[fieldId] = value;
      }
    }

    return Object.keys(overrides).length > 0 ? overrides : null;
  } catch {
    return null;
  }
}

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

type SyncQueueRow = Omit<SyncQueueEntry, 'custom_field_overrides'> & {
  custom_field_overrides: string | null;
};

type SyncQueueEntryInsert = Omit<SyncQueueEntry, 'id' | 'queued_at' | 'error_message' | 'custom_field_overrides'> & {
  custom_field_overrides?: CustomFieldValues | null;
};

export class SyncQueueRepository implements ISyncQueueRepository {
  private stmts: PreparedStatements;

  constructor(private db: Database) {
    // Column list for consistent SELECT queries
    const cols = `id, kpm_project_id, plan_item_id, association_id, operation,
             target_issue_type_id, target_issue_type_name, target_parent_key,
             target_status_category, custom_field_overrides, queued_by, queued_at, error_message`;

    this.stmts = {
      // Read operations
      getById: db.prepare(`SELECT ${cols} FROM sync_queue WHERE id = ?`),
      getByProject: db.prepare(`SELECT ${cols} FROM sync_queue WHERE kpm_project_id = ? ORDER BY queued_at`),
      getByProjectWithPlanItems: db.prepare(`
        SELECT
          sq.id, sq.kpm_project_id, sq.plan_item_id, sq.association_id, sq.operation,
          sq.target_issue_type_id, sq.target_issue_type_name, sq.target_parent_key,
          sq.target_status_category, sq.custom_field_overrides, sq.queued_by, sq.queued_at, sq.error_message,
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
      getQueueCount: db.prepare(`
        SELECT COUNT(*) as count FROM sync_queue sq
        JOIN plan_items pi ON sq.plan_item_id = pi.id
        WHERE sq.kpm_project_id = ? AND (pi.status_category IS NULL OR pi.status_category != 'none')
      `),

      // Write operations - use RETURNING to avoid re-query
      insert: db.prepare(`
        INSERT INTO sync_queue (
          id, kpm_project_id, plan_item_id, association_id, operation,
          target_issue_type_id, target_issue_type_name, target_parent_key,
          target_status_category, custom_field_overrides, queued_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    const rows = this.stmts.getByProject.all(projectId) as SyncQueueRow[];
    return rows.map((row) => ({
      ...row,
      custom_field_overrides: parseCustomFieldOverrides(row.custom_field_overrides),
    }));
  }

  getByProjectWithPlanItems(projectId: string): SyncQueueEntryWithPlanItem[] {
    const rows = this.stmts.getByProjectWithPlanItems.all(projectId) as (SyncQueueRow & {
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
      custom_field_overrides: parseCustomFieldOverrides(row.custom_field_overrides ?? null),
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
    const row = this.stmts.getByPlanItem.get(planItemId) as SyncQueueRow | undefined;
    if (!row) return undefined;
    return {
      ...row,
      custom_field_overrides: parseCustomFieldOverrides(row.custom_field_overrides),
    };
  }

  getByItemId(planItemId: string): SyncQueueEntry | undefined {
    return this.getByPlanItem(planItemId);
  }

  getByAssociation(associationId: string): SyncQueueEntry[] {
    const rows = this.stmts.getByAssociation.all(associationId) as SyncQueueRow[];
    return rows.map((row) => ({
      ...row,
      custom_field_overrides: parseCustomFieldOverrides(row.custom_field_overrides),
    }));
  }

  getQueuedItemsWithPlanData(projectId: string): SyncQueueEntryWithPlanItem[] {
    return this.getByProjectWithPlanItems(projectId);
  }

  getQueueCount(projectId: string): number {
    const result = this.stmts.getQueueCount.get(projectId) as { count: number };
    return result.count;
  }

  // Overload signatures to match interface
  add(entry: SyncQueueEntryInsert): SyncQueueEntry;
  add(projectId: string, planItemId: string, associationId: string, operation: 'create' | 'update', queuedBy: 'user' | 'claude'): SyncQueueEntry | null;
  add(
    entryOrProjectId: SyncQueueEntryInsert | string,
    planItemId?: string,
    associationId?: string,
    operation?: 'create' | 'update',
    queuedBy?: 'user' | 'claude'
  ): SyncQueueEntry | null {
    // Handle overloaded signature
    let entry: {
      kpm_project_id: string;
      plan_item_id: string;
      association_id: string;
      operation: 'create' | 'update';
      target_issue_type_id?: string | null;
      target_issue_type_name?: string | null;
      target_parent_key?: string | null;
      target_status_category?: string | null;
      queued_by: 'user' | 'claude';
      custom_field_overrides?: CustomFieldValues | null;
    };

    if (typeof entryOrProjectId === 'string') {
      entry = {
        kpm_project_id: entryOrProjectId,
        plan_item_id: planItemId!,
        association_id: associationId!,
        operation: operation!,
        target_issue_type_id: null,
        target_issue_type_name: null,
        target_parent_key: null,
        target_status_category: null,
        queued_by: queuedBy!,
        custom_field_overrides: null,
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
    const id = randomUUID();
    const overrides = entry.custom_field_overrides && Object.keys(entry.custom_field_overrides).length > 0
      ? entry.custom_field_overrides
      : null;
    const inserted = this.stmts.insert.get(
      id,
      entry.kpm_project_id,
      entry.plan_item_id,
      entry.association_id,
      entry.operation,
      entry.target_issue_type_id ?? null,
      entry.target_issue_type_name ?? null,
      entry.target_parent_key ?? null,
      entry.target_status_category ?? null,
      overrides ? JSON.stringify(overrides) : null,
      entry.queued_by
    ) as SyncQueueRow;

    return {
      ...inserted,
      custom_field_overrides: overrides,
    };
  }

  get(id: string): SyncQueueEntry | undefined {
    const row = this.stmts.getById.get(id) as SyncQueueRow | undefined;
    if (!row) return undefined;
    return {
      ...row,
      custom_field_overrides: parseCustomFieldOverrides(row.custom_field_overrides),
    };
  }

  update(id: string, updates: Partial<Pick<SyncQueueEntry, 'target_issue_type_id' | 'target_issue_type_name' | 'target_parent_key' | 'target_status_category' | 'custom_field_overrides' | 'error_message'>>): void {
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
    if (updates.custom_field_overrides !== undefined) {
      fields.push('custom_field_overrides = ?');
      values.push(updates.custom_field_overrides ? JSON.stringify(updates.custom_field_overrides) : null);
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
