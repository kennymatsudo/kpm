/**
 * Linear Document Link Repository Implementation
 */

import type { Database, Statement } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { SyncDirection } from '../../../services/documentSync';
import type {
  ILinearDocumentLinkRepository,
  LinearDocumentLink,
  LinearDocumentLinkCreate,
  LinearDocumentSyncState,
} from '../../interfaces/linearDocuments';

interface PreparedStatements {
  getByProject: Statement;
  getByDocumentPath: Statement;
  getByDocumentId: Statement;
  insert: Statement;
  updateSyncState: Statement;
  updateTitle: Statement;
  updateDirection: Statement;
  delete: Statement;
}

export class LinearDocumentLinkRepository implements ILinearDocumentLinkRepository {
  private stmts: PreparedStatements;

  constructor(db: Database) {
    this.stmts = {
      getByProject: db.prepare(
        'SELECT * FROM linear_document_links WHERE project_id = ? ORDER BY document_path'
      ),
      getByDocumentPath: db.prepare(
        'SELECT * FROM linear_document_links WHERE project_id = ? AND document_path = ?'
      ),
      getByDocumentId: db.prepare(
        'SELECT * FROM linear_document_links WHERE linear_document_id = ?'
      ),
      insert: db.prepare(`
        INSERT INTO linear_document_links (
          id, project_id, document_path, linear_document_id, slug_id,
          document_title, document_url, parent_kind, parent_id, direction
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `),
      updateSyncState: db.prepare(`
        UPDATE linear_document_links
        SET last_synced_at = ?, local_content_hash = ?, remote_content_hash = ?, remote_version = ?
        WHERE id = ?
      `),
      updateTitle: db.prepare('UPDATE linear_document_links SET document_title = ? WHERE id = ?'),
      updateDirection: db.prepare('UPDATE linear_document_links SET direction = ? WHERE id = ?'),
      delete: db.prepare('DELETE FROM linear_document_links WHERE id = ?'),
    };
  }

  getByProject(projectId: string): LinearDocumentLink[] {
    return this.stmts.getByProject.all(projectId) as LinearDocumentLink[];
  }

  getByDocumentPath(projectId: string, documentPath: string): LinearDocumentLink | null {
    return this.stmts.getByDocumentPath.get(projectId, documentPath) as LinearDocumentLink | null;
  }

  getByDocumentId(linearDocumentId: string): LinearDocumentLink | null {
    return this.stmts.getByDocumentId.get(linearDocumentId) as LinearDocumentLink | null;
  }

  create(link: LinearDocumentLinkCreate): LinearDocumentLink {
    return this.stmts.insert.get(
      randomUUID(),
      link.project_id,
      link.document_path,
      link.linear_document_id,
      link.slug_id,
      link.document_title,
      link.document_url,
      link.parent_kind,
      link.parent_id,
      link.direction
    ) as LinearDocumentLink;
  }

  updateSyncState(id: string, state: LinearDocumentSyncState): void {
    this.stmts.updateSyncState.run(
      state.last_synced_at,
      state.local_content_hash,
      state.remote_content_hash,
      state.remote_version,
      id
    );
  }

  updateTitle(id: string, title: string): void {
    this.stmts.updateTitle.run(title, id);
  }

  updateDirection(id: string, direction: SyncDirection): void {
    this.stmts.updateDirection.run(direction, id);
  }

  delete(id: string): void {
    this.stmts.delete.run(id);
  }
}
