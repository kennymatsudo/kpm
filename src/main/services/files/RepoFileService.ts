import fs from 'fs';
import path from 'path';
import type { FileNode, Repo } from '../../../shared/types';

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
      repoId: string,
      options: { recursive?: boolean; depth?: number } = {}
      const repo = deps.getRepoById(repoId);
      if (!repo) {
        return failure('Repository not found');
      }

      const repoPath = repo.path;
        return failure('Repository path does not exist');
      }

      if (!valid) {
        return failure('Invalid path');
      }

      try {
        return success(nodes);
      } catch (error) {
        return failure(`Failed to list directory: ${error}`);
      }
    },

    /**
     */
      const repo = deps.getRepoById(repoId);
      if (!repo) {
        return failure('Repository not found');
      }

      const repoPath = repo.path;
      if (!valid) {
        return failure('Invalid path');
      }

      try {
        }

        if (stats.isDirectory()) {
          return failure('Cannot read directory as file');
        }

        return success(content);
      } catch (error) {
        return failure(`Failed to read file: ${error}`);
      }
    },

    /**
     * Write file content to a connected repo.
     * Only allows writing to editable file types (markdown, text, json, yaml).
     */
      const repo = deps.getRepoById(repoId);
      if (!repo) {
        return failure('Repository not found');
      }

      // Check if file is editable
      if (!isEditableExtension(relativePath)) {
        return failure('File type is not editable in workspace. Use your IDE for code files.');
      }

      const repoPath = repo.path;
      if (!valid) {
        return failure('Invalid path');
      }

      try {
        // Ensure parent directory exists

        return success(undefined);
      } catch (error) {
        return failure(`Failed to write file: ${error}`);
      }
    },

    /**
     * Get information about a single file/folder in a repo.
     */
      const repo = deps.getRepoById(repoId);
      if (!repo) {
        return failure('Repository not found');
      }

      const repoPath = repo.path;
      if (!valid) {
        return failure('Invalid path');
      }

      try {
          return failure('Path does not exist');
        }

      } catch (error) {
        return failure(`Failed to get info: ${error}`);
      }
    },
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type RepoFileService = ReturnType<typeof createRepoFileService>;
