/**
 * Worktree Repository Implementation - Dependency Injection Version
 *
 * Optimized with prepared statement caching and RETURNING clause.
 */

import type { Database, Statement } from 'better-sqlite3';
import type { Worktree } from '../../../../shared/types';
import type { IWorktreeRepository } from '../../interfaces';

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

export class WorktreeRepository implements IWorktreeRepository {
  private stmts: PreparedStatements;

  constructor(db: Database) {
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

  getByProject(projectId: string): Worktree[] {
    return this.stmts.getByProject.all(projectId) as Worktree[];
  }

  get(id: string): Worktree | undefined {
    return this.stmts.getById.get(id) as Worktree | undefined;
  }

  getByPlanItem(planItemId: string): Worktree | undefined {
    return this.stmts.getByPlanItem.get(planItemId) as Worktree | undefined;
  }

  create(worktree: Omit<Worktree, 'created_at' | 'last_opened_at'>): Worktree {
    // Use RETURNING to get inserted row in one query
    return this.stmts.insert.get(
      worktree.id,
      worktree.plan_item_id,
      worktree.project_id,
      worktree.worktree_path,
      worktree.branch_name
    ) as Worktree;
  }

  updateLastOpened(id: string): void {
    this.stmts.updateLastOpened.run(id);
  }

  delete(id: string): void {
    this.stmts.delete.run(id);
  }
}
