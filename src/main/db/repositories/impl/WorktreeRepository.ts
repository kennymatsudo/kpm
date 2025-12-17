 *
 * Optimized with prepared statement caching and RETURNING clause.
import type { Database, Statement } from 'better-sqlite3';
/**
 * Prepared statements cache for hot paths.
 */
interface PreparedStatements {
  getByProject: Statement;
  getById: Statement;
  getByPlanItem: Statement;
  insert: Statement;
  updateLastOpened: Statement;
  delete: Statement;
}

  private stmts: PreparedStatements;

    this.stmts = {
      getByProject: db.prepare('SELECT * FROM worktrees WHERE project_id = ? ORDER BY created_at DESC'),
      getById: db.prepare('SELECT * FROM worktrees WHERE id = ?'),
      getByPlanItem: db.prepare('SELECT * FROM worktrees WHERE plan_item_id = ?'),
      // Use RETURNING to avoid re-query
      insert: db.prepare(`
        INSERT INTO worktrees (id, plan_item_id, project_id, worktree_path, branch_name)
        VALUES (?, ?, ?, ?, ?)
        RETURNING *
      `),
      updateLastOpened: db.prepare('UPDATE worktrees SET last_opened_at = CURRENT_TIMESTAMP WHERE id = ?'),
      delete: db.prepare('DELETE FROM worktrees WHERE id = ?'),
    };
  }
    return this.stmts.getByProject.all(projectId) as Worktree[];
    return this.stmts.getById.get(id) as Worktree | undefined;
    return this.stmts.getByPlanItem.get(planItemId) as Worktree | undefined;
    // Use RETURNING to get inserted row in one query
    return this.stmts.insert.get(
    ) as Worktree;
    this.stmts.updateLastOpened.run(id);
    this.stmts.delete.run(id);
