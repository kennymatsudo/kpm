import fs from 'fs';
import path from 'path';
import { success, failure, type AsyncResult } from '../result';
import type { FileNode, Repo } from '../../../shared/types';
import {
  ensureParentDirectory,
  getScopedEntryInfo,
  listScopedDirectory,
  pathExists,
  resolveScopedPath,
} from './scopedFs';
import { findEnclosingGitRoot, getIgnoredPaths } from '../repo/gitUtils';
import { shouldHideFileTreeEntry } from './fileTreeVisibility';

/** Mark gitignored nodes in-place. */
async function enrichWithIgnoreStatus(nodes: FileNode[], repoPath: string, gitRoot: string): Promise<void> {
  const flat: FileNode[] = [];
  const walk = (ns: FileNode[]) => ns.forEach(n => { flat.push(n); if (n.children) walk(n.children); });
  walk(nodes);
  if (flat.length === 0) return;
  const relToGit = flat.map(n => path.relative(gitRoot, path.join(repoPath, n.path)));
  const ignored = await getIgnoredPaths(gitRoot, relToGit);
  flat.forEach((n, i) => { if (ignored.has(relToGit[i])) n.isIgnored = true; });
}

/**
 * Editable file extensions - these can be written to
 * Code files are read-only in the workspace
 */
const EDITABLE_EXTENSIONS = ['.md', '.txt', '.json', '.yaml', '.yml', '.toml'];

function isEditableExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return EDITABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export interface RepoFileServiceDeps {
  getRepoById: (repoId: string) => Repo | null;
}

export function createRepoFileService(deps: RepoFileServiceDeps) {
  return {
    /**
     * List directory contents within a connected repo.
     */
    async listDirectory(
      repoId: string,
      relativePath = '',
      options: { recursive?: boolean; depth?: number } = {}
    ): AsyncResult<FileNode[]> {
      const repo = deps.getRepoById(repoId);
      if (!repo) {
        return failure('Repository not found');
      }

      const repoPath = repo.path;
      if (!(await pathExists(repoPath))) {
        return failure('Repository path does not exist');
      }

      const { valid, fullPath } = resolveScopedPath(repoPath, relativePath);
      if (!valid) {
        return failure('Invalid path');
      }

      try {
        const nodes = await listScopedDirectory({
          rootPath: repoPath,
          directoryPath: fullPath,
          recursive: options.recursive ?? false,
          maxDepth: options.depth ?? 10,
          shouldHideEntry: shouldHideFileTreeEntry,
          onEntryReadError: (entryPath, error) => {
            console.error(`[RepoFileService] Failed to read ${entryPath}:`, error);
          },
        });
        const gitRoot = findEnclosingGitRoot(repoPath) ?? repoPath;
        await enrichWithIgnoreStatus(nodes, repoPath, gitRoot);
        return success(nodes);
      } catch (error) {
        return failure(`Failed to list directory: ${error}`);
      }
    },

    /**
     * Read file content asynchronously to avoid blocking the main process.
     */
    async readFileAsync(repoId: string, relativePath: string): AsyncResult<string> {
      const repo = deps.getRepoById(repoId);
      if (!repo) {
        return failure('Repository not found');
      }

      const repoPath = repo.path;
      const { valid, fullPath } = resolveScopedPath(repoPath, relativePath);
      if (!valid) {
        return failure('Invalid path');
      }

      try {
        let stats: fs.Stats;
        try {
          stats = await fs.promises.stat(fullPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return failure('File does not exist');
          }
          throw error;
        }

        if (stats.isDirectory()) {
          return failure('Cannot read directory as file');
        }

        const content = await fs.promises.readFile(fullPath, 'utf-8');
        return success(content);
      } catch (error) {
        return failure(`Failed to read file: ${error}`);
      }
    },

    /**
     * Write file content to a connected repo.
     * Only allows writing to editable file types (markdown, text, json, yaml).
     */
    async writeFile(repoId: string, relativePath: string, content: string): AsyncResult<void> {
      const repo = deps.getRepoById(repoId);
      if (!repo) {
        return failure('Repository not found');
      }

      // Check if file is editable
      if (!isEditableExtension(relativePath)) {
        return failure('File type is not editable in workspace. Use your IDE for code files.');
      }

      const repoPath = repo.path;
      const { valid, fullPath } = resolveScopedPath(repoPath, relativePath);
      if (!valid) {
        return failure('Invalid path');
      }

      try {
        // Ensure parent directory exists
        await ensureParentDirectory(fullPath);

        await fs.promises.writeFile(fullPath, content, 'utf-8');
        return success(undefined);
      } catch (error) {
        return failure(`Failed to write file: ${error}`);
      }
    },

    /**
     * Get information about a single file/folder in a repo.
     */
    async getInfo(repoId: string, relativePath: string): AsyncResult<FileNode> {
      const repo = deps.getRepoById(repoId);
      if (!repo) {
        return failure('Repository not found');
      }

      const repoPath = repo.path;
      const { valid, fullPath } = resolveScopedPath(repoPath, relativePath);
      if (!valid) {
        return failure('Invalid path');
      }

      try {
        if (!(await pathExists(fullPath))) {
          return failure('Path does not exist');
        }

        return success(await getScopedEntryInfo(fullPath, relativePath, path.basename(repoPath)));
      } catch (error) {
        return failure(`Failed to get info: ${error}`);
      }
    },

    /**
     * Resolve a repo-relative path to a validated absolute path.
     */
    async getFullPath(repoId: string, relativePath: string): AsyncResult<string> {
      const repo = deps.getRepoById(repoId);
      if (!repo) {
        return failure('Repository not found');
      }

      const repoPath = repo.path;
      const { valid, fullPath } = resolveScopedPath(repoPath, relativePath);
      if (!valid) {
        return failure('Invalid path');
      }

      if (!(await pathExists(fullPath))) {
        return failure('Path does not exist');
      }

      return success(fullPath);
    },
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type RepoFileService = ReturnType<typeof createRepoFileService>;
