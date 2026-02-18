import type { Database, Statement } from 'better-sqlite3';
import type { IToolPermissionRepository } from '../../interfaces/settings';
import type { ToolPermission } from '../../../../shared/types';

interface PreparedStatements {
  listByProject: Statement;
  upsert: Statement;
  delete: Statement;
  deleteByProject: Statement;
}

export class ToolPermissionRepository implements IToolPermissionRepository {
  private stmts: PreparedStatements;

  constructor(private db: Database) {
    this.stmts = {
      listByProject: db.prepare(
        'SELECT * FROM tool_permissions WHERE project_id = ? ORDER BY granted_at ASC'
      ),
      upsert: db.prepare(`
        INSERT INTO tool_permissions (id, project_id, cache_key, tool_name, label)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(project_id, cache_key) DO UPDATE SET
          tool_name = excluded.tool_name,
          label = excluded.label,
          granted_at = CURRENT_TIMESTAMP
      `),
      delete: db.prepare('DELETE FROM tool_permissions WHERE id = ?'),
      deleteByProject: db.prepare('DELETE FROM tool_permissions WHERE project_id = ?'),
    };
  }

  listByProject(projectId: string): ToolPermission[] {
    return this.stmts.listByProject.all(projectId) as ToolPermission[];
  }

  upsert(permission: Omit<ToolPermission, 'granted_at'>): void {
    this.stmts.upsert.run(
      permission.id,
      permission.project_id,
      permission.cache_key,
      permission.tool_name,
      permission.label
    );
  }

  delete(id: string): void {
    this.stmts.delete.run(id);
  }

  deleteByProject(projectId: string): void {
    this.stmts.deleteByProject.run(projectId);
  }
}
