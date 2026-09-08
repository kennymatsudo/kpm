import type { Database, Statement } from 'better-sqlite3';
import type { IProjectWriteGrantRepository } from '../../interfaces/settings';

interface PreparedStatements {
  listGranted: Statement;
  grant: Statement;
  revoke: Statement;
}

/**
 * The user's standing consent for direct writes, one row per granted project.
 * A row's presence is the whole state, so there is nothing to update.
 */
export class ProjectWriteGrantRepository implements IProjectWriteGrantRepository {
  private stmts: PreparedStatements;

  constructor(db: Database) {
    this.stmts = {
      listGranted: db.prepare('SELECT project_id FROM project_write_grants'),
      grant: db.prepare(
        'INSERT INTO project_write_grants (project_id) VALUES (?) ON CONFLICT(project_id) DO NOTHING'
      ),
      revoke: db.prepare('DELETE FROM project_write_grants WHERE project_id = ?'),
    };
  }

  listGrantedProjectIds(): string[] {
    return (this.stmts.listGranted.all() as { project_id: string }[]).map((row) => row.project_id);
  }

  grant(projectId: string): void {
    this.stmts.grant.run(projectId);
  }

  revoke(projectId: string): void {
    this.stmts.revoke.run(projectId);
  }
}
