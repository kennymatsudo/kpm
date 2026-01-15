/**
 * Tracker Repository Implementation - Dependency Injection Version
 *
 * Optimized with prepared statement caching and RETURNING clause.
 */

import type { Database, Statement } from 'better-sqlite3';
import type {
  CustomFieldValues,
  StatusMapping,
  TrackerAssociation,
  TrackerAssociationWithScope,
  TrackerConnection,
  TrackerProjectScope,
} from '../../../../shared/types';
import type { ITrackerRepository } from '../../interfaces';

// Helper to parse status_mapping JSON from database
function parseStatusMapping(raw: string | null): StatusMapping | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StatusMapping;
  } catch {
    return null;
  }
}

// Helper to parse custom_field_values JSON from database
// Now a flat structure: { fieldId: value }
function parseCustomFieldValues(raw: string | null): CustomFieldValues | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    // Validate all values are strings (flat structure)
    const result: CustomFieldValues = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') {
        result[key] = value;
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

/**
 * Prepared statements cache for hot paths.
 */
interface PreparedStatements {
  // Connections
  getConnection: Statement;
  getConnectionById: Statement;
  listConnections: Statement;
  insertConnection: Statement;

  // Scopes
  getScopes: Statement;
  getScopeById: Statement;
  getScopeByKey: Statement;
  insertScope: Statement;

  // Associations
  getAssociations: Statement;
  getAssociationsWithContext: Statement;
  getAssociationById: Statement;
  insertAssociation: Statement;
  deleteAssociation: Statement;
  updateLastSynced: Statement;
  updateStatusMapping: Statement;
  updateCustomFieldValues: Statement;
  updateEpicKey: Statement;
  getCustomFieldValues: Statement;

  // Plan items by association
  hasAssociationItems: Statement;
  getItemsByAssociation: Statement;
}

export class TrackerRepository implements ITrackerRepository {
  private stmts: PreparedStatements;

    // Column lists for consistent queries
    const connCols = 'id, tracker_type, site_url, display_name, created_at';
    const scopeCols = 'id, connection_id, project_key, project_name, created_at';
    const assocCols = 'id, kpm_project_id, scope_id, jql_filter, display_name, status_mapping, custom_field_values, epic_key, last_synced_at, created_at';

    this.stmts = {
      // Connections
      getConnection: db.prepare(`SELECT ${connCols} FROM tracker_connections WHERE tracker_type = ? AND site_url = ?`),
      getConnectionById: db.prepare(`SELECT ${connCols} FROM tracker_connections WHERE id = ?`),
      listConnections: db.prepare(`SELECT ${connCols} FROM tracker_connections ORDER BY site_url`),
      insertConnection: db.prepare(`
        INSERT INTO tracker_connections (id, tracker_type, site_url, display_name)
        VALUES (?, ?, ?, ?)
        RETURNING ${connCols}
      `),

      // Scopes
      getScopes: db.prepare(`SELECT ${scopeCols} FROM tracker_project_scopes WHERE connection_id = ? ORDER BY project_key`),
      getScopeById: db.prepare(`SELECT ${scopeCols} FROM tracker_project_scopes WHERE id = ?`),
      getScopeByKey: db.prepare(`SELECT ${scopeCols} FROM tracker_project_scopes WHERE connection_id = ? AND project_key = ?`),
      insertScope: db.prepare(`
        INSERT INTO tracker_project_scopes (id, connection_id, project_key, project_name)
        VALUES (?, ?, ?, ?)
        RETURNING ${scopeCols}
      `),

      // Associations
      getAssociations: db.prepare(`SELECT ${assocCols} FROM kpm_tracker_associations WHERE kpm_project_id = ? ORDER BY created_at`),
      getAssociationsWithContext: db.prepare(`
        SELECT
          a.id, a.kpm_project_id, a.scope_id, a.jql_filter, a.display_name,
          a.status_mapping, a.custom_field_values, a.epic_key, a.last_synced_at, a.created_at,
          s.project_key, s.project_name,
          c.site_url
        FROM kpm_tracker_associations a
        JOIN tracker_project_scopes s ON a.scope_id = s.id
        JOIN tracker_connections c ON s.connection_id = c.id
        WHERE a.kpm_project_id = ?
        ORDER BY a.created_at
      `),
      getAssociationById: db.prepare(`
        SELECT
          a.id, a.kpm_project_id, a.scope_id, a.jql_filter, a.display_name,
          a.status_mapping, a.custom_field_values, a.epic_key, a.last_synced_at, a.created_at,
          s.project_key, s.project_name,
          c.site_url
        FROM kpm_tracker_associations a
        JOIN tracker_project_scopes s ON a.scope_id = s.id
        JOIN tracker_connections c ON s.connection_id = c.id
        WHERE a.id = ?
      `),
      insertAssociation: db.prepare(`
        INSERT INTO kpm_tracker_associations (id, kpm_project_id, scope_id, jql_filter, display_name)
        VALUES (?, ?, ?, ?, ?)
      `),
      deleteAssociation: db.prepare('DELETE FROM kpm_tracker_associations WHERE id = ?'),
      updateLastSynced: db.prepare(`UPDATE kpm_tracker_associations SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?`),
      updateStatusMapping: db.prepare(`UPDATE kpm_tracker_associations SET status_mapping = ? WHERE id = ?`),
      updateCustomFieldValues: db.prepare(`UPDATE kpm_tracker_associations SET custom_field_values = ? WHERE id = ?`),
      updateEpicKey: db.prepare(`UPDATE kpm_tracker_associations SET epic_key = ? WHERE id = ?`),
      getCustomFieldValues: db.prepare(`SELECT custom_field_values FROM kpm_tracker_associations WHERE id = ?`),

      // Plan items by association - use EXISTS for short-circuit
      hasAssociationItems: db.prepare(`SELECT EXISTS (SELECT 1 FROM plan_items WHERE association_id = ? LIMIT 1) as has_items`),
      getItemsByAssociation: db.prepare(`SELECT id, external_key FROM plan_items WHERE association_id = ?`),
    };
  }

  // ============================================
  // Tracker Connections (Level 1)
  // ============================================

  getConnection(trackerType: string, siteUrl: string): TrackerConnection | undefined {
    return this.stmts.getConnection.get(trackerType, siteUrl) as TrackerConnection | undefined;
  }

  getConnectionById(id: string): TrackerConnection | undefined {
    return this.stmts.getConnectionById.get(id) as TrackerConnection | undefined;
  }

  createConnection(trackerType: string, siteUrl: string, displayName?: string): TrackerConnection {
    // Use RETURNING to get inserted row in one query
    return this.stmts.insertConnection.get(id, trackerType, siteUrl, displayName ?? null) as TrackerConnection;
  }

  getOrCreateConnection(trackerType: string, siteUrl: string, displayName?: string): TrackerConnection {
    const existing = this.getConnection(trackerType, siteUrl);
    if (existing) return existing;
    return this.createConnection(trackerType, siteUrl, displayName);
  }

  listConnections(): TrackerConnection[] {
    return this.stmts.listConnections.all() as TrackerConnection[];
  }

  getConnections(): TrackerConnection[] {
    return this.listConnections();
  }

  // ============================================
  // Tracker Project Scopes (Level 2)
  // ============================================

  getScopes(connectionId: string): TrackerProjectScope[] {
    return this.stmts.getScopes.all(connectionId) as TrackerProjectScope[];
  }

  getScopeById(id: string): TrackerProjectScope | undefined {
    return this.stmts.getScopeById.get(id) as TrackerProjectScope | undefined;
  }

  getScopeByKey(connectionId: string, projectKey: string): TrackerProjectScope | undefined {
    return this.stmts.getScopeByKey.get(connectionId, projectKey) as TrackerProjectScope | undefined;
  }

  createScope(connectionId: string, projectKey: string, projectName?: string): TrackerProjectScope {
    // Use RETURNING to get inserted row in one query
    return this.stmts.insertScope.get(id, connectionId, projectKey, projectName ?? null) as TrackerProjectScope;
  }

  getOrCreateScope(connectionId: string, projectKey: string, projectName?: string): TrackerProjectScope {
    const existing = this.getScopeByKey(connectionId, projectKey);
    if (existing) return existing;
    return this.createScope(connectionId, projectKey, projectName);
  }

  getScopesByConnection(connectionId: string): TrackerProjectScope[] {
    return this.getScopes(connectionId);
  }

  // ============================================
  // Tracker Associations (Level 3)
  // ============================================

  getAssociations(projectId: string): TrackerAssociation[] {
    return rows.map((row) => ({
      ...row,
      status_mapping: parseStatusMapping(row.status_mapping),
      custom_field_values: parseCustomFieldValues(row.custom_field_values),
    }));
  }

  getAssociationsWithContext(projectId: string): TrackerAssociationWithScope[] {
    return rows.map((row) => ({
      ...row,
      status_mapping: parseStatusMapping(row.status_mapping),
      custom_field_values: parseCustomFieldValues(row.custom_field_values),
    }));
  }

  getAssociationById(id: string): TrackerAssociationWithScope | undefined {
    const row = this.stmts.getAssociationById.get(id) as (Omit<TrackerAssociationWithScope, 'status_mapping' | 'custom_field_values'> & { status_mapping: string | null; custom_field_values: string | null }) | undefined;
    if (!row) return undefined;
    return {
      ...row,
      status_mapping: parseStatusMapping(row.status_mapping),
      custom_field_values: parseCustomFieldValues(row.custom_field_values),
    };
  }

  getAssociationsByProject(projectId: string): TrackerAssociationWithScope[] {
    return this.getAssociationsWithContext(projectId);
  }

  createAssociation(
    projectId: string,
    scopeId: string,
    jqlFilter: string,
    displayName?: string
  ): TrackerAssociation {
    this.stmts.insertAssociation.run(id, projectId, scopeId, jqlFilter, displayName ?? null);
    // Need to fetch with context for full return type
    return this.getAssociationById(id)!;
  }

  deleteAssociation(id: string): void {
    this.stmts.deleteAssociation.run(id);
  }

  updateAssociationLastSynced(id: string): void {
    this.stmts.updateLastSynced.run(id);
  }

  updateStatusMapping(id: string, mapping: StatusMapping | null): void {
    this.stmts.updateStatusMapping.run(mapping ? JSON.stringify(mapping) : null, id);
  }

  updateCustomFieldValues(id: string, values: CustomFieldValues | null): void {
    // Clean up empty values before saving
    const cleaned = values && Object.keys(values).length > 0 ? values : null;
    this.stmts.updateCustomFieldValues.run(cleaned ? JSON.stringify(cleaned) : null, id);
  }

  updateEpicKey(id: string, epicKey: string | null): void {
    this.stmts.updateEpicKey.run(epicKey, id);
  }

  getCustomFieldValues(id: string): CustomFieldValues | null {
    const row = this.stmts.getCustomFieldValues.get(id) as { custom_field_values: string | null } | undefined;
    return row ? parseCustomFieldValues(row.custom_field_values) : null;
  }

  hasAssociationItems(associationId: string): boolean {
    // Use EXISTS for short-circuit (faster than COUNT(*))
    const result = this.stmts.hasAssociationItems.get(associationId) as { has_items: number };
    return result.has_items === 1;
  }

  getItemsByAssociation(associationId: string): { id: string; external_key: string }[] {
    return this.stmts.getItemsByAssociation.all(associationId) as { id: string; external_key: string }[];
  }
}
