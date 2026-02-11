/**
 * Repo Repository Implementation - Dependency Injection Version
 *
 * Optimized with prepared statement caching and RETURNING clause.
 */

import type { Database, Statement } from 'better-sqlite3';
import type { Repo, RepoEnvironmentMode } from '../../../../shared/types';
import type { IRepoRepository } from '../../interfaces';

/**
 * Prepared statements cache for hot paths.
 */
interface PreparedStatements {
  getByProject: Statement;
  getById: Statement;
  insert: Statement;
  updateEnvironmentMode: Statement;
  delete: Statement;
}

export class RepoRepository implements IRepoRepository {
  private stmts: PreparedStatements;

  constructor(db: Database) {
    this.stmts = {
      getByProject: db.prepare('SELECT * FROM repos WHERE project_id = ? ORDER BY created_at'),
      getById: db.prepare('SELECT * FROM repos WHERE id = ?'),
      // Use RETURNING to avoid re-query
      insert: db.prepare(`
        INSERT INTO repos (id, project_id, path) VALUES (?, ?, ?)
        RETURNING *
      `),
      updateEnvironmentMode: db.prepare('UPDATE repos SET environment_mode = ? WHERE id = ?'),
      delete: db.prepare('DELETE FROM repos WHERE id = ?'),
    };
  }

  getByProject(projectId: string): Repo[] {
    return this.stmts.getByProject.all(projectId) as Repo[];
  }

  add(projectId: string, path: string): Repo {
    // Use RETURNING to get inserted row in one query
    return this.stmts.insert.get(id, projectId, path) as Repo;
  }

  getById(id: string): Repo | undefined {
    return this.stmts.getById.get(id) as Repo | undefined;
  }

  updateEnvironmentMode(id: string, mode: RepoEnvironmentMode): void {
    this.stmts.updateEnvironmentMode.run(mode, id);
  }

  delete(id: string): void {
    this.stmts.delete.run(id);
  }

  remove(id: string): void {
    this.delete(id);
  }
}
