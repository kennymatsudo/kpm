/**
 * Project Repository Implementation - Dependency Injection Version
 *
 * Optimized with prepared statement caching and RETURNING clause.
 */

import type { Database, Statement } from 'better-sqlite3';
import type { Project } from '../../../../shared/types';

/**
 * File system operations interface for testing
 */
export interface IFileSystem {
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
}

/**
 * Path utilities interface for testing
 */
export interface IPathUtils {
  join(...paths: string[]): string;
}

/**
 * Prepared statements cache for hot paths.
 */
interface PreparedStatements {
  // Read operations
  getById: Statement;
  list: Statement;

  // Write operations
  insert: Statement;
  updateTokens: Statement;
  resetTokens: Statement;
  updateStorybookUrl: Statement;
  delete: Statement;
}

export class ProjectRepository implements IProjectRepository {
  private stmts: PreparedStatements;

  constructor(
    private db: Database,
    private userDataPath: string,
    private fs: IFileSystem,
    private path: IPathUtils
  ) {
    this.stmts = {
      // Read operations
      getById: db.prepare('SELECT * FROM projects WHERE id = ?'),

      // Write operations - use RETURNING to avoid re-query
      insert: db.prepare(`
        INSERT INTO projects (id, name, folder_path, phase)
        VALUES (?, ?, ?, 'discovery')
        RETURNING *
      `),
      updateTokens: db.prepare(`
        UPDATE projects SET
          session_tokens = session_tokens + ?,
          session_input_tokens = session_input_tokens + ?,
          session_output_tokens = session_output_tokens + ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),
      resetTokens: db.prepare(`
        UPDATE projects SET
          session_tokens = 0,
          session_input_tokens = 0,
          session_output_tokens = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),
      updateStorybookUrl: db.prepare(`
        UPDATE projects SET storybook_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `),
      delete: db.prepare('DELETE FROM projects WHERE id = ?'),
    };
  }


    this.fs.mkdirSync(folderPath, { recursive: true });

    const initialContent = `# ${name}

This is your project workspace. Use this file to track context, conventions, and learnings.
`;

    return this.stmts.insert.get(id, name, folderPath) as Project;
  }

  get(id: string): Project | undefined {
    return this.stmts.getById.get(id) as Project | undefined;
  }

  list(): Project[] {
    return this.stmts.list.all() as Project[];
  }

  update(id: string, updates: Partial<Pick<Project, 'name' | 'phase'>>): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.phase !== undefined) {
      fields.push('phase = ?');
      values.push(updates.phase);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    // Dynamic update (uncommon path, ok to prepare each time)
    const stmt = this.db.prepare(`
      UPDATE projects SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);
  }

  updateTokens(projectId: string, tokens: { total: number; input: number; output: number }): void {
    this.stmts.updateTokens.run(tokens.total, tokens.input, tokens.output, projectId);
  }

  resetTokens(projectId: string): void {
    this.stmts.resetTokens.run(projectId);
  }

  updateStorybookUrl(projectId: string, url: string | null): void {
    this.stmts.updateStorybookUrl.run(url, projectId);
  }

  delete(id: string): void {
    // Get project folder path before deletion
    const project = this.get(id);
    const folderPath = project?.folder_path;

    // Delete project folder FIRST to avoid orphaned folders if DB delete succeeds but FS fails
    // This order ensures we can retry deletion if something fails partway through
    if (folderPath && this.fs.existsSync(folderPath)) {
      try {
        this.fs.rmSync(folderPath, { recursive: true, force: true });
      } catch (error) {
        // If filesystem deletion fails, throw to prevent database deletion
        // This keeps the data consistent - user can retry or manually clean up
        console.error(`Failed to delete project folder ${folderPath}:`, error);
      }
    }

    // Delete database record only after filesystem cleanup succeeds
    this.stmts.delete.run(id);
  }
}
