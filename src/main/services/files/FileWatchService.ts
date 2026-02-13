import fs from 'fs';
import path from 'path';
import { pathExists, resolveScopedPath } from './scopedFs';

/** Context file from the project folder */
export interface ContextFile {
  /** Relative path from project root */
  path: string;
  /** File name */
  name: string;
  isClaudeMd: boolean;
  /** Last modified timestamp */
  modifiedAt: string;
}

/**
 */
class FileWatchServiceClass {

  }

  /**
   */
  async listContextFiles(projectId: string): Promise<{ success: boolean; files?: ContextFile[]; error?: string }> {
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    try {
      const files: ContextFile[] = [];


        }

      files.sort((a, b) => {
      });

      return { success: true, files };
    } catch (error) {
      console.error('[FileWatchService] Failed to list context files:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Validate that a path doesn't escape the project folder (path traversal protection).
   * Uses symlink-aware scoped resolution to prevent traversal and path escape.
   */
  private isPathWithinProject(projectFolder: string, relativePath: string): { valid: boolean; fullPath: string } {
    return resolveScopedPath(projectFolder, relativePath);
  }

  /**
   * Read a context file by relative path.
   */
  async readContextFile(
    projectId: string,
    relativePath: string
  ): Promise<{ success: boolean; content: string | null; error?: string }> {
    if (!project) {
      return { success: false, content: null, error: 'Project not found' };
    }

    // Security: ensure the path doesn't escape project folder
    const { valid, fullPath } = this.isPathWithinProject(project.folder_path, relativePath);
    if (!valid) {
      return { success: false, content: null, error: 'Invalid path' };
    }

    try {
      if (await pathExists(fullPath)) {
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        return { success: true, content };
      } else {
        return { success: false, content: null, error: 'File not found' };
      }
    } catch (error) {
      return { success: false, content: null, error: String(error) };
    }
  }

  /**
   * Write a context file by relative path.
   */
  async writeContextFile(
    projectId: string,
    relativePath: string,
    content: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    // Security: ensure the path doesn't escape project folder
    const { valid, fullPath } = this.isPathWithinProject(project.folder_path, relativePath);
    if (!valid) {
      return { success: false, error: 'Invalid path' };
    }

    try {
      await fs.promises.writeFile(fullPath, content, 'utf-8');
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Delete a context file by relative path.
   */
  async deleteContextFile(
    projectId: string,
    relativePath: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    }

    // Security: ensure the path doesn't escape project folder
    const { valid, fullPath } = this.isPathWithinProject(project.folder_path, relativePath);
    if (!valid) {
      return { success: false, error: 'Invalid path' };
    }

    try {
      if (await pathExists(fullPath)) {
        await fs.promises.unlink(fullPath);
        return { success: true };
      } else {
        return { success: false, error: 'File not found' };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Import a file into the project root as a context file.
   * Copies the file content to the project folder.
   */
  async importContextFile(
    projectId: string,
    sourcePath: string
  ): Promise<{ success: boolean; filename?: string; error?: string }> {
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    try {
      // Get the filename from the source path
      let filename = path.basename(sourcePath);

      // Ensure it has .md extension
      if (!filename.endsWith('.md')) {
        filename = filename + '.md';
      }

      // Handle filename conflicts by adding a number suffix
      let targetPath = path.join(project.folder_path, filename);
      let counter = 1;
      const baseName = filename.replace(/\.md$/, '');
      while (await pathExists(targetPath)) {
        filename = `${baseName} (${counter}).md`;
        targetPath = path.join(project.folder_path, filename);
        counter++;
      }

      // Read the source file and write to target
      const content = await fs.promises.readFile(sourcePath, 'utf-8');
      await fs.promises.writeFile(targetPath, content, 'utf-8');

      return { success: true, filename };
    } catch (error) {
      console.error('[FileWatchService] Failed to import context file:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   */
    if (!project) {
      return { success: false, content: null, error: 'Project not found' };
    }

    try {
      }
    } catch (error) {
      return { success: false, content: null, error: String(error) };
    }
  }

  /**
   */
  async writeClaudeMd(projectId: string, content: string): Promise<{ success: boolean; error?: string }> {
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    try {
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Returns null content if file doesn't exist (new document).
   */
  async readDocumentFile(
    projectId: string,
    filePath: string
  ): Promise<{ success: boolean; content: string | null; error?: string }> {
    if (!project) {
      return { success: false, content: null, error: 'Project not found' };
    }

    const { valid, fullPath } = this.isPathWithinProject(project.folder_path, filePath);
    if (!valid) {
      return { success: false, content: null, error: 'Invalid path' };
    }

    try {
      if (await pathExists(fullPath)) {
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        return { success: true, content };
      } else {
        return { success: true, content: null };
      }
    } catch (error) {
      return { success: false, content: null, error: String(error) };
    }
  }
}

export const FileWatchService = new FileWatchServiceClass();
