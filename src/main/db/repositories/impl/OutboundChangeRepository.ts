/**
 * Outbound Change Repository Implementation - Dependency Injection Version
 *
 * Optimized with prepared statement caching and RETURNING clause.
 */

import type { Database, Statement } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { CustomFieldValues, OutboundChange, OutboundChangeWithPlanItem } from '../../../../shared/types';
import type { IOutboundChangeRepository } from '../../interfaces';

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
  insertDelete: Statement;
  remove: Statement;
  clearProject: Statement;
  updateStatusCategory: Statement;
  updateResolvedType: Statement;
  setError: Statement;
}

type OutboundChangeRow = Omit<OutboundChange, 'custom_field_overrides'> & {
  custom_field_overrides: string | null;
};

type OutboundChangeInsert = Omit<
  OutboundChange,
  'id' | 'plan_item_id' | 'operation' | 'queued_at' | 'error_message' | 'custom_field_overrides' | 'external_key' | 'external_id' | 'tracker_type'
> & {
  plan_item_id: string;
  operation: 'create' | 'update';
  custom_field_overrides?: CustomFieldValues | null;
};

/** Detached delete row: no live plan item, snapshots the external identity being removed. */
interface OutboundChangeDeleteInsert {
  kpm_project_id: string;
  association_id: string;
  external_key: string;
  external_id: string | null;
  tracker_type: string;
  queued_by: 'user' | 'claude';
}

export class OutboundChangeRepository implements IOutboundChangeRepository {
  private stmts: PreparedStatements;

  constructor(private db: Database) {
    // Column list for consistent SELECT queries
    const cols = `id, kpm_project_id, plan_item_id, association_id, operation,
             target_issue_type_id, target_issue_type_name, target_parent_key,
             target_status_category, custom_field_overrides, queued_by, queued_at, error_message,
             external_key, external_id, tracker_type`;

    this.stmts = {
      // Read operations
      getById: db.prepare(`SELECT ${cols} FROM outbound_changes WHERE id = ?`),
      getByProject: db.prepare(`SELECT ${cols} FROM outbound_changes WHERE kpm_project_id = ? ORDER BY queued_at`),
      getByProjectWithPlanItems: db.prepare(`
        SELECT
          oc.id, oc.kpm_project_id, oc.plan_item_id, oc.association_id, oc.operation,
          oc.target_issue_type_id, oc.target_issue_type_name, oc.target_parent_key,
          oc.target_status_category, oc.custom_field_overrides, oc.queued_by, oc.queued_at, oc.error_message,
          oc.external_key, oc.external_id, oc.tracker_type,
          pi.title as plan_item_title,
          pi.description as plan_item_description,
          pi.label as plan_item_label,
          pi.parent_id as plan_item_parent_id,
          pi.external_key as plan_item_external_key,
          pi.external_type as plan_item_external_type
        FROM outbound_changes oc
        JOIN plan_items pi ON oc.plan_item_id = pi.id
        WHERE oc.kpm_project_id = ?
        ORDER BY oc.queued_at
      `),
      getByPlanItem: db.prepare(`SELECT ${cols} FROM outbound_changes WHERE plan_item_id = ?`),
      getByAssociation: db.prepare(`SELECT ${cols} FROM outbound_changes WHERE association_id = ? ORDER BY queued_at`),
      getQueueCount: db.prepare(`
        SELECT COUNT(*) as count FROM outbound_changes oc
        JOIN plan_items pi ON oc.plan_item_id = pi.id
        WHERE oc.kpm_project_id = ? AND (pi.status_category IS NULL OR pi.status_category != 'none')
      `),

      // Write operations - use RETURNING to avoid re-query
      insert: db.prepare(`
        INSERT INTO outbound_changes (
          id, kpm_project_id, plan_item_id, association_id, operation,
          target_issue_type_id, target_issue_type_name, target_parent_key,
          target_status_category, custom_field_overrides, queued_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING ${cols}
      `),
      insertDelete: db.prepare(`
        INSERT INTO outbound_changes (
          id, kpm_project_id, plan_item_id, association_id, operation,
          external_key, external_id, tracker_type, queued_by
        )
        VALUES (?, ?, NULL, ?, 'delete', ?, ?, ?, ?)
        RETURNING ${cols}
      `),
      remove: db.prepare('DELETE FROM outbound_changes WHERE id = ?'),
      clearProject: db.prepare('DELETE FROM outbound_changes WHERE kpm_project_id = ?'),
      updateStatusCategory: db.prepare(`UPDATE outbound_changes SET target_status_category = ? WHERE id = ?`),
      updateResolvedType: db.prepare(`
        UPDATE outbound_changes
        SET target_issue_type_id = ?, target_issue_type_name = ?, target_parent_key = ?
        WHERE id = ?
      `),
      setError: db.prepare(`UPDATE outbound_changes SET error_message = ? WHERE id = ?`),
    };
  }

  getByProject(projectId: string): OutboundChange[] {
    const rows = this.stmts.getByProject.all(projectId) as OutboundChangeRow[];
    return rows.map((row) => ({
      ...row,
      custom_field_overrides: parseCustomFieldOverrides(row.custom_field_overrides),
    }));
  }

  getByProjectWithPlanItems(projectId: string): OutboundChangeWithPlanItem[] {
    // The JOIN drops detached delete rows, so plan_item_id is always present here.
    const rows = this.stmts.getByProjectWithPlanItems.all(projectId) as (Omit<OutboundChangeRow, 'plan_item_id'> & {
      plan_item_id: string;
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
      external_key: row.external_key,
      external_id: row.external_id,
      tracker_type: row.tracker_type,
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

  getByPlanItem(planItemId: string): OutboundChange | undefined {
    const row = this.stmts.getByPlanItem.get(planItemId) as OutboundChangeRow | undefined;
    if (!row) return undefined;
    return {
      ...row,
      custom_field_overrides: parseCustomFieldOverrides(row.custom_field_overrides),
    };
  }

  getByItemId(planItemId: string): OutboundChange | undefined {
    return this.getByPlanItem(planItemId);
  }

  getByAssociation(associationId: string): OutboundChange[] {
    const rows = this.stmts.getByAssociation.all(associationId) as OutboundChangeRow[];
    return rows.map((row) => ({
      ...row,
      custom_field_overrides: parseCustomFieldOverrides(row.custom_field_overrides),
    }));
  }

  getQueuedItemsWithPlanData(projectId: string): OutboundChangeWithPlanItem[] {
    return this.getByProjectWithPlanItems(projectId);
  }

  getQueueCount(projectId: string): number {
    const result = this.stmts.getQueueCount.get(projectId) as { count: number };
    return result.count;
  }

  // Overload signatures to match interface
  add(entry: OutboundChangeInsert): OutboundChange;
  add(projectId: string, planItemId: string, associationId: string, operation: 'create' | 'update', queuedBy: 'user' | 'claude'): OutboundChange | null;
  add(
    entryOrProjectId: OutboundChangeInsert | string,
    planItemId?: string,
    associationId?: string,
    operation?: 'create' | 'update',
    queuedBy?: 'user' | 'claude'
  ): OutboundChange | null {
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
    ) as OutboundChangeRow;

    return {
      ...inserted,
      custom_field_overrides: overrides,
    };
  }

  /**
   * Insert a detached delete row. Rejected by the partial unique index if a
   * pending delete already exists for the same association + external key.
   */
  addDelete(entry: OutboundChangeDeleteInsert): OutboundChange {
    const id = randomUUID();
    const inserted = this.stmts.insertDelete.get(
      id,
      entry.kpm_project_id,
      entry.association_id,
      entry.external_key,
      entry.external_id,
      entry.tracker_type,
      entry.queued_by
    ) as OutboundChangeRow;

    return {
      ...inserted,
      custom_field_overrides: null,
    };
  }

  get(id: string): OutboundChange | undefined {
    const row = this.stmts.getById.get(id) as OutboundChangeRow | undefined;
    if (!row) return undefined;
    return {
      ...row,
      custom_field_overrides: parseCustomFieldOverrides(row.custom_field_overrides),
    };
  }

  update(id: string, updates: Partial<Pick<OutboundChange, 'target_issue_type_id' | 'target_issue_type_name' | 'target_parent_key' | 'target_status_category' | 'custom_field_overrides' | 'error_message'>>): void {
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
    const stmt = this.db.prepare(`UPDATE outbound_changes SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  remove(id: string): void {
    this.stmts.remove.run(id);
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
