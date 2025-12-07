/**
 * Project Repository Implementation - Dependency Injection Version
 */

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

export class ProjectRepository implements IProjectRepository {
  constructor(
    private db: Database,
    private userDataPath: string,
    private fs: IFileSystem,
    private path: IPathUtils


    this.fs.mkdirSync(folderPath, { recursive: true });

    const initialContent = `# ${name}

This is your project workspace. Use this file to track context, conventions, and learnings.
`;

  }

  get(id: string): Project | undefined {
  }

  list(): Project[] {
  }

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

    const stmt = this.db.prepare(`
      UPDATE projects SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);
  }

  updateTokens(projectId: string, tokens: { total: number; input: number; output: number }): void {
  }

  resetTokens(projectId: string): void {
  }

  delete(id: string): void {
    // Get project folder path before deletion
    const project = this.get(id);
    const folderPath = project?.folder_path;

    if (folderPath && this.fs.existsSync(folderPath)) {
      try {
        this.fs.rmSync(folderPath, { recursive: true, force: true });
      } catch (error) {
        console.error(`Failed to delete project folder ${folderPath}:`, error);
      }
    }
  }
}
