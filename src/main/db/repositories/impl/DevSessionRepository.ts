 *
 * Optimized with prepared statement caching and RETURNING clause.
import type { Database, Statement } from 'better-sqlite3';
/**
 * Prepared statements cache for hot paths.
 */
interface PreparedStatements {
  // Read operations
  getById: Statement;
  getByProject: Statement;
  getByProjectWithPlanItems: Statement;
  getActiveSessions: Statement;
  getByPlanItem: Statement;
  getActiveByPlanItem: Statement;

  // Write operations
  insert: Statement;
  updateStatus: Statement;
  delete: Statement;
  markActiveAsInactive: Statement;
}

  private stmts: PreparedStatements;

    this.stmts = {
      // Read operations
      getById: db.prepare('SELECT * FROM dev_sessions WHERE id = ?'),
      getByProject: db.prepare('SELECT * FROM dev_sessions WHERE project_id = ? ORDER BY created_at DESC'),
      getByProjectWithPlanItems: db.prepare(`
        SELECT
          ds.*,
          pi.id as pi_id,
          pi.title as pi_title,
          pi.description as pi_description,
          pi.label as pi_label,
        FROM dev_sessions ds
        WHERE ds.project_id = ?
        ORDER BY ds.created_at DESC
      `),
      getActiveSessions: db.prepare(`
        SELECT * FROM dev_sessions
        WHERE project_id = ? AND status IN ('pending', 'active')
        ORDER BY created_at DESC
      `),
      getByPlanItem: db.prepare('SELECT * FROM dev_sessions WHERE plan_item_id = ? ORDER BY created_at DESC LIMIT 1'),
      getActiveByPlanItem: db.prepare(`
        SELECT * FROM dev_sessions
        WHERE plan_item_id = ? AND status IN ('pending', 'active')
        ORDER BY created_at DESC
        LIMIT 1
      `),

      // Write operations - use RETURNING to avoid re-query
      insert: db.prepare(`
        INSERT INTO dev_sessions (
          worktree_path, branch_name, base_branch,
        )
        RETURNING *
      `),
      updateStatus: db.prepare('UPDATE dev_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
      delete: db.prepare('DELETE FROM dev_sessions WHERE id = ?'),
      markActiveAsInactive: db.prepare(`
        UPDATE dev_sessions
        SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'active'
      `),
    };
  }
    return this.stmts.getById.get(id) as DevSession | undefined;
    return this.stmts.getByProject.all(projectId) as DevSession[];
    return this.stmts.getActiveSessions.all(projectId) as DevSession[];
    return this.stmts.getByPlanItem.get(planItemId) as DevSession | undefined;
    return this.stmts.getActiveByPlanItem.get(planItemId) as DevSession | undefined;
    // Use RETURNING to get inserted row in one query
    return this.stmts.insert.get(
    ) as DevSession;
    this.stmts.updateStatus.run(status, id);
    this.stmts.delete.run(id);
    this.stmts.markActiveAsInactive.run();
