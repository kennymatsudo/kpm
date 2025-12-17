/**
 * Attachment Repository Implementation - Dependency Injection Version
 *
 * Optimized with prepared statement caching and RETURNING clause.
 */

import type { Database, Statement } from 'better-sqlite3';
import type { Attachment } from '../../../../shared/types';
import type { IAttachmentRepository } from '../../interfaces';

/**
 * Prepared statements cache for hot paths.
 */
interface PreparedStatements {
  getByProject: Statement;
  getById: Statement;
  insert: Statement;
  delete: Statement;
}

export class AttachmentRepository implements IAttachmentRepository {
  private stmts: PreparedStatements;

    this.stmts = {
      getByProject: db.prepare('SELECT * FROM attachments WHERE project_id = ? ORDER BY created_at'),
      getById: db.prepare('SELECT * FROM attachments WHERE id = ?'),
      // Use RETURNING to avoid re-query
      insert: db.prepare(`
        INSERT INTO attachments (id, project_id, path, filename) VALUES (?, ?, ?, ?)
        RETURNING *
      `),
      delete: db.prepare('DELETE FROM attachments WHERE id = ?'),
    };
  }

  getByProject(projectId: string): Attachment[] {
    return this.stmts.getByProject.all(projectId) as Attachment[];
  }

  add(projectId: string, sourcePath: string, filename: string): Attachment {
    // Use RETURNING to get inserted row in one query
    return this.stmts.insert.get(id, projectId, sourcePath, filename) as Attachment;
  }

  get(id: string): Attachment | undefined {
    return this.stmts.getById.get(id) as Attachment | undefined;
  }

  delete(id: string): void {
    this.stmts.delete.run(id);
  }

  remove(id: string): void {
    this.delete(id);
  }
}
