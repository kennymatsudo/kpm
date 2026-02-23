/**
 * Type Mapping Repository Implementation - Dependency Injection Version
 *
 * Optimized with prepared statement caching and RETURNING clause.
 */

import type { Database, Statement } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { TrackerTypeMapping } from '../../../../shared/types';
import type { ITypeMappingRepository } from '../../interfaces';

/**
 * Prepared statements cache for hot paths.
 */
interface PreparedStatements {
  getByProject: Statement;
  getByScope: Statement;
  get: Statement;
  upsert: Statement;
  delete: Statement;
}

export class TypeMappingRepository implements ITypeMappingRepository {
  private stmts: PreparedStatements;

  constructor(private db: Database) {
    const cols = 'id, kpm_project_id, scope_id, kpm_label, tracker_issue_type_id, tracker_issue_type_name, created_at';

    this.stmts = {
      getByProject: db.prepare(`SELECT ${cols} FROM tracker_type_mappings WHERE kpm_project_id = ? ORDER BY kpm_label`),
      getByScope: db.prepare(`SELECT ${cols} FROM tracker_type_mappings WHERE kpm_project_id = ? AND scope_id = ? ORDER BY kpm_label`),
      get: db.prepare(`SELECT ${cols} FROM tracker_type_mappings WHERE kpm_project_id = ? AND scope_id = ? AND kpm_label = ?`),
      // Use ON CONFLICT for upsert - single query instead of check + insert/update
      upsert: db.prepare(`
        INSERT INTO tracker_type_mappings (id, kpm_project_id, scope_id, kpm_label, tracker_issue_type_id, tracker_issue_type_name)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(kpm_project_id, scope_id, kpm_label) DO UPDATE SET
          tracker_issue_type_id = excluded.tracker_issue_type_id,
          tracker_issue_type_name = excluded.tracker_issue_type_name
        RETURNING ${cols}
      `),
      delete: db.prepare('DELETE FROM tracker_type_mappings WHERE id = ?'),
    };
  }

  getByProject(projectId: string): TrackerTypeMapping[] {
    return this.stmts.getByProject.all(projectId) as TrackerTypeMapping[];
  }

  getByScope(projectId: string, scopeId: string): TrackerTypeMapping[] {
    return this.stmts.getByScope.all(projectId, scopeId) as TrackerTypeMapping[];
  }

  getByProjectAndScope(projectId: string, scopeId: string): TrackerTypeMapping[] {
    return this.getByScope(projectId, scopeId);
  }

  get(projectId: string, scopeId: string, kpmLabel: string): TrackerTypeMapping | undefined {
    return this.stmts.get.get(projectId, scopeId, kpmLabel) as TrackerTypeMapping | undefined;
  }

  getMapping(projectId: string, scopeId: string, kpmLabel: string): TrackerTypeMapping | undefined {
    return this.get(projectId, scopeId, kpmLabel);
  }

  save(mapping: Omit<TrackerTypeMapping, 'id' | 'created_at'>): TrackerTypeMapping {
    const id = randomUUID();
    // Use ON CONFLICT for upsert - single query instead of check + insert/update
    return this.stmts.upsert.get(
      id,
      mapping.kpm_project_id,
      mapping.scope_id,
      mapping.kpm_label,
      mapping.tracker_issue_type_id,
      mapping.tracker_issue_type_name
    ) as TrackerTypeMapping;
  }

  delete(id: string): void {
    this.stmts.delete.run(id);
  }

  remove(id: string): void {
    this.delete(id);
  }

  upsert(projectId: string, scopeId: string, kpmLabel: string, trackerIssueTypeId: string, trackerIssueTypeName: string): TrackerTypeMapping {
    return this.save({
      kpm_project_id: projectId,
      scope_id: scopeId,
      kpm_label: kpmLabel,
      tracker_issue_type_id: trackerIssueTypeId,
      tracker_issue_type_name: trackerIssueTypeName,
    });
  }

  bulkUpsert(projectId: string, scopeId: string, mappings: { kpmLabel: string; trackerIssueTypeId: string; trackerIssueTypeName: string }[]): void {
    const transaction = this.db.transaction(() => {
      for (const mapping of mappings) {
        this.upsert(projectId, scopeId, mapping.kpmLabel, mapping.trackerIssueTypeId, mapping.trackerIssueTypeName);
      }
    });
    transaction();
  }
}
