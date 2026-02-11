/**
 * Confluence Link Repository Implementation
 *
 * Manages document-to-page links for Confluence sync.
 * Optimized with prepared statement caching and RETURNING clause.
 */

import type { Database, Statement } from 'better-sqlite3';
import type {
  ConfluencePageLink,
  ConfluenceLinkCreate,
  SyncState,
  IConfluenceLinkRepository,
} from '../../interfaces/confluence';

/**
 * Prepared statements cache for hot paths.
 */
interface PreparedStatements {
  getById: Statement;
  getByProject: Statement;
  getByDocumentPath: Statement;
  getByPageId: Statement;
  insert: Statement;
  updateSyncState: Statement;
  updatePageTitle: Statement;
  delete: Statement;
}

export class ConfluenceLinkRepository implements IConfluenceLinkRepository {
  private stmts: PreparedStatements;

  constructor(db: Database) {
    this.stmts = {
      getById: db.prepare('SELECT * FROM confluence_page_links WHERE id = ?'),
      getByProject: db.prepare(
        'SELECT * FROM confluence_page_links WHERE project_id = ? ORDER BY document_path'
      ),
      getByDocumentPath: db.prepare(
        'SELECT * FROM confluence_page_links WHERE project_id = ? AND document_path = ?'
      ),
      getByPageId: db.prepare('SELECT * FROM confluence_page_links WHERE page_id = ?'),
      insert: db.prepare(`
        INSERT INTO confluence_page_links (id, project_id, document_path, site_url, space_key, page_id, page_title)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `),
      updateSyncState: db.prepare(`
        UPDATE confluence_page_links
        SET last_synced_at = ?, local_content_hash = ?, remote_content_hash = ?, remote_version = ?
        WHERE id = ?
      `),
      updatePageTitle: db.prepare(
        'UPDATE confluence_page_links SET page_title = ? WHERE id = ?'
      ),
      delete: db.prepare('DELETE FROM confluence_page_links WHERE id = ?'),
    };
  }

  get(id: string): ConfluencePageLink | null {
    return this.stmts.getById.get(id) as ConfluencePageLink | null;
  }

  getByProject(projectId: string): ConfluencePageLink[] {
    return this.stmts.getByProject.all(projectId) as ConfluencePageLink[];
  }

  getByDocumentPath(projectId: string, documentPath: string): ConfluencePageLink | null {
    return this.stmts.getByDocumentPath.get(projectId, documentPath) as ConfluencePageLink | null;
  }

  getByPageId(pageId: string): ConfluencePageLink | null {
    return this.stmts.getByPageId.get(pageId) as ConfluencePageLink | null;
  }

  create(link: ConfluenceLinkCreate): ConfluencePageLink {
    return this.stmts.insert.get(
      id,
      link.project_id,
      link.document_path,
      link.site_url,
      link.space_key,
      link.page_id,
      link.page_title
    ) as ConfluencePageLink;
  }

  updateSyncState(id: string, state: SyncState): void {
    this.stmts.updateSyncState.run(
      state.last_synced_at,
      state.local_content_hash,
      state.remote_content_hash,
      state.remote_version,
      id
    );
  }

  updatePageTitle(id: string, title: string): void {
    this.stmts.updatePageTitle.run(title, id);
  }

  delete(id: string): void {
    this.stmts.delete.run(id);
  }
}
