import type { Database, Statement } from 'better-sqlite3';
import type { FileMetadataRow, IProjectFileMetadataRepository } from '../../interfaces/files';

interface PreparedStatements {
  getByPath: Statement;
  getAllForProject: Statement;
  upsertHash: Statement;
  setSummaryForHash: Statement;
  deleteByPath: Statement;
}

export class ProjectFileMetadataRepository implements IProjectFileMetadataRepository {
  private stmts: PreparedStatements;

  constructor(private db: Database) {
    this.stmts = {
      getByPath: db.prepare(
        'SELECT * FROM project_file_metadata WHERE project_id = ? AND path = ?'
      ),
      getAllForProject: db.prepare(
        'SELECT * FROM project_file_metadata WHERE project_id = ?'
      ),
      upsertHash: db.prepare(`
        INSERT INTO project_file_metadata (project_id, path, content_hash, summary, summarized_at)
        VALUES (?, ?, ?, NULL, NULL)
        ON CONFLICT(project_id, path) DO UPDATE SET
          content_hash = excluded.content_hash,
          summary = CASE WHEN content_hash != excluded.content_hash THEN NULL ELSE summary END,
          summarized_at = CASE WHEN content_hash != excluded.content_hash THEN NULL ELSE summarized_at END
      `),
      setSummaryForHash: db.prepare(
        'UPDATE project_file_metadata SET summary = ?, summarized_at = CURRENT_TIMESTAMP WHERE project_id = ? AND path = ? AND content_hash = ?'
      ),
      deleteByPath: db.prepare(
        'DELETE FROM project_file_metadata WHERE project_id = ? AND path = ?'
      ),
    };
  }

  getByPath(projectId: string, path: string): FileMetadataRow | null {
    const row = this.stmts.getByPath.get(projectId, path) as FileMetadataRow | undefined;
    return row ?? null;
  }

  getAllForProject(projectId: string): FileMetadataRow[] {
    return this.stmts.getAllForProject.all(projectId) as FileMetadataRow[];
  }

  upsertHash(projectId: string, path: string, hash: string): void {
    this.stmts.upsertHash.run(projectId, path, hash);
  }

  setSummaryForHash(projectId: string, path: string, hash: string, summary: string): boolean {
    const result = this.stmts.setSummaryForHash.run(summary, projectId, path, hash);
    return result.changes > 0;
  }

  deleteByPath(projectId: string, path: string): void {
    this.stmts.deleteByPath.run(projectId, path);
  }

  deleteByPathPrefix(projectId: string, prefix: string): void {
    this.db
      .prepare('DELETE FROM project_file_metadata WHERE project_id = ? AND (path = ? OR path LIKE ?)')
      .run(projectId, prefix, prefix + '/%');
  }
}
