/**
 * Outbound Change Repository Implementation - Dependency Injection Version
 *
 * Optimized with prepared statement caching and RETURNING clause.
 */

import type { Database, Statement } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type {
  CustomFieldValues,
  OutboundChange,
  OutboundChangeOperation,
  OutboundItemChange,
  StatusCategory,
} from '../../../../shared/types';
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
  getByPlanItem: Statement;
  getByAssociation: Statement;

  // Write operations
  insert: Statement;
  insertDelete: Statement;
  remove: Statement;
  clearProject: Statement;
  updateStatusCategory: Statement;
  setError: Statement;
}

/**
 * What SQLite hands back: every column nullable, `custom_field_overrides` still
 * JSON text. `toOutboundChange` is the one place this becomes a typed variant.
 */
interface OutboundChangeRow {
  id: string;
  kpm_project_id: string;
  plan_item_id: string | null;
  association_id: string;
  operation: OutboundChangeOperation;
  target_issue_type_id: string | null;
  target_issue_type_name: string | null;
  target_parent_key: string | null;
  target_status_category: StatusCategory | null;
  custom_field_overrides: string | null;
  queued_by: 'user' | 'claude';
  queued_at: string;
  error_message: string | null;
  external_key: string | null;
  external_id: string | null;
  tracker_type: string | null;
}

type OutboundChangeInsert = Omit<
  OutboundItemChange,
  'id' | 'plan_item_id' | 'operation' | 'queued_at' | 'error_message' | 'custom_field_overrides' | 'external_key' | 'external_id' | 'tracker_type'
> & {
  plan_item_id: string;
  operation: 'create' | 'update';
  custom_field_overrides?: CustomFieldValues | null;
};

/**
 * The only place a row becomes an Outbound Change. A delete row without an
 * `external_key` cannot be pushed anywhere, so it is a corrupt row rather than
 * a case for callers to defend against — hence the throw.
 */
function toOutboundChange(row: OutboundChangeRow): OutboundChange {
  const base = {
    id: row.id,
    kpm_project_id: row.kpm_project_id,
    association_id: row.association_id,
    queued_by: row.queued_by,
    queued_at: row.queued_at,
    error_message: row.error_message,
  };

  if (row.operation === 'delete') {
    if (!row.external_key || !row.tracker_type) {
      throw new Error(`Outbound Change ${row.id} is a delete with no external target`);
    }
    return {
      ...base,
      operation: 'delete',
      plan_item_id: null,
      target_issue_type_id: null,
      target_issue_type_name: null,
      target_parent_key: null,
      target_status_category: null,
      custom_field_overrides: null,
      external_key: row.external_key,
      external_id: row.external_id,
      tracker_type: row.tracker_type,
    };
  }

  return {
    ...base,
    operation: row.operation,
    plan_item_id: row.plan_item_id!,
    target_issue_type_id: row.target_issue_type_id,
    target_issue_type_name: row.target_issue_type_name,
    target_parent_key: row.target_parent_key,
    target_status_category: row.target_status_category,
    custom_field_overrides: parseCustomFieldOverrides(row.custom_field_overrides),
    external_key: null,
    external_id: null,
    tracker_type: null,
  };
}

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
      getByPlanItem: db.prepare(`SELECT ${cols} FROM outbound_changes WHERE plan_item_id = ?`),
      getByAssociation: db.prepare(`SELECT ${cols} FROM outbound_changes WHERE association_id = ? ORDER BY queued_at`),

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
      setError: db.prepare(`UPDATE outbound_changes SET error_message = ? WHERE id = ?`),
    };
  }

  getByProject(projectId: string): OutboundChange[] {
    const rows = this.stmts.getByProject.all(projectId) as OutboundChangeRow[];
    return rows.map(toOutboundChange);
  }

  getByPlanItem(planItemId: string): OutboundChange | undefined {
    const row = this.stmts.getByPlanItem.get(planItemId) as OutboundChangeRow | undefined;
    return row ? toOutboundChange(row) : undefined;
  }

  getByAssociation(associationId: string): OutboundChange[] {
    const rows = this.stmts.getByAssociation.all(associationId) as OutboundChangeRow[];
    return rows.map(toOutboundChange);
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

    return toOutboundChange(inserted);
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

    return toOutboundChange(inserted);
  }

  get(id: string): OutboundChange | undefined {
    const row = this.stmts.getById.get(id) as OutboundChangeRow | undefined;
    return row ? toOutboundChange(row) : undefined;
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

  setError(id: string, errorMessage: string): void {
    this.stmts.setError.run(errorMessage, id);
  }
}
