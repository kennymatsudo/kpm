import fs from 'fs';
import path from 'path';
import { success, failure, type AsyncResult, type ServiceResult } from '../result';
import type { FileNode, PlanItem } from '../../../shared/types';
import {
  COMPAT_CONTEXT_FILENAME,
  DEFAULT_CONTEXT_FILENAME,
} from '../../../shared/contextFile';
import {
  ensureParentDirectory,
  getScopedEntryInfo,
  listScopedDirectory,
  pathExists,
} from './scopedFs';
import {
  checkRealpathAccess,
  checkExternalTargetAllowed,
  type RealpathAccessResult,
} from './pathSecurity';
import type { FileSummaryService } from './FileSummaryService';
import { resolvePlanRefs } from '../../documents/planRefResolver';
import { getConfig } from '../../config';

const MARKDOWN_EXT_REGEX = /\.(md|mdx|markdown)$/i;

const MAX_BINARY_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_SUMMARY_BACKFILL_PER_LIST = 25;

export type ExternalAccessOp =
  | 'write'
  | 'delete'
  | 'rename'
  | 'create-symlink'
  | 'copy-into';

export interface ExternalAccessEvent {
  projectId: string;
  op: ExternalAccessOp;
  /** Path inside the project (i.e. the symlink the user sees). */
  relativePath: string;
  /** Realpath of the on-disk target the op actually touched. */
  realpath: string;
}

export interface FileExplorerServiceDeps {
  getProjectFolder: (projectId: string) => string | null;
  fileSummaryService?: FileSummaryService;
  /**
   * Optional lookup for the save-time `@plan/<uuid>` rewrite. When provided
   * and the saved file is markdown in a git-tracked folder, `writeFile`
   * rewrites refs to `[title](@plan/<uuid>)` form before disk write so
   * shared docs travel cleanly through GitHub. See
   * `docs/shared-project-context.md` § "@plan/<uuid> references in shared docs".
   */
  getPlanItems?: (projectId: string) => readonly PlanItem[];
  /**
   * Notified after a successful mutating op (write/delete/rename/create-symlink/
   * copy-into) when the realpath of the target lands outside the project folder.
   * Lets the IPC layer surface the cross-boundary access to the renderer for
   * audit/observability. Reads are intentionally not audited — they're the
   * common case for symlinked sources of truth.
   */
  onExternalAccess?: (event: ExternalAccessEvent) => void;
}

export interface FileExplorerListDirectoryOptions {
  recursive?: boolean;
  depth?: number;
  backfillMissingSummaries?: boolean;
}

function enrichWithSummaries(nodes: FileNode[], summaryMap: Map<string, string>): void {
  for (const node of nodes) {
    if (!node.isDirectory) {
      const summary = summaryMap.get(node.path);
      if (summary) node.summary = summary;
    }
    if (node.children) enrichWithSummaries(node.children, summaryMap);
  }
}

function queueMissingSummaries(
  projectId: string,
  projectFolder: string,
  nodes: FileNode[],
  summaryMap: Map<string, string>,
  fileSummaryService: FileSummaryService,
  remaining: { count: number }
): void {
  if (remaining.count <= 0) {
    return;
  }

  for (const node of nodes) {
    if (remaining.count <= 0) {
      return;
    }

    if (node.isDirectory) {
      if (node.children) {
        queueMissingSummaries(
          projectId,
          projectFolder,
          node.children,
          summaryMap,
          fileSummaryService,
          remaining
        );
      }
      continue;
    }

    if (node.isSymlink || summaryMap.has(node.path) || !fileSummaryService.shouldSummarizePath(node.path)) {
      continue;
    }

    if (fileSummaryService.enqueueFileFromDisk(projectId, node.path, path.join(projectFolder, node.path))) {
      remaining.count -= 1;
    }
  }
}

export function createFileExplorerService(deps: FileExplorerServiceDeps) {
    projectFolder: string,
    relativePath: string
    if (!valid) {
      return { error: failure('Invalid path') };
    }
    const access = await checkRealpathAccess(fullPath, projectFolder);
    if (!access.allowed) {
      return { error: failure(access.reason ?? 'Access denied') };
    }
  }

  function audit(
    projectId: string,
    op: ExternalAccessOp,
    relativePath: string,
    access: RealpathAccessResult
  ): void {
    if (!access.external) return;
    console.warn(
      `[FileExplorer] ${op} on '${relativePath}' touched external path: ${access.realpath}`
    );
    deps.onExternalAccess?.({ projectId, op, relativePath, realpath: access.realpath });
  }

    /**
     * List directory contents with optional recursion.
     */
    async listDirectory(
      projectId: string,
      relativePath = '',
      options: FileExplorerListDirectoryOptions = {}
    ): AsyncResult<FileNode[]> {
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }


      try {
        let nodes = await listScopedDirectory({
          rootPath: projectFolder,
          directoryPath: fullPath,
          recursive: options.recursive ?? false,
          maxDepth: options.depth ?? 10,
          maxSymlinkDepth: getConfig().fileExplorer.maxSymlinkDepth,
          onEntryReadError: (entryPath, error) => {
            console.error(`[FileExplorerService] Failed to read ${entryPath}:`, error);
          },
        });

        const isRootDirectory = relativePath === '' || relativePath === '.';
        if (isRootDirectory && await pathExists(path.join(projectFolder, DEFAULT_CONTEXT_FILENAME))) {
          nodes = nodes.filter((node) => node.name !== COMPAT_CONTEXT_FILENAME);
        }

        const summaryMap = deps.fileSummaryService?.getMetadataMap(projectId);
          enrichWithSummaries(nodes, summaryMap);
        }
        if (options.backfillMissingSummaries && summaryMap && deps.fileSummaryService) {
          queueMissingSummaries(projectId, projectFolder, nodes, summaryMap, deps.fileSummaryService, {
            count: MAX_SUMMARY_BACKFILL_PER_LIST,
          });
        }

        return success(nodes);
      } catch (error) {
        return failure(`Failed to list directory: ${error}`);
      }
    },

    /**
     * Create a new folder.
     */
    async createFolder(projectId: string, relativePath: string): AsyncResult<FileNode> {
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }

      if ('error' in gated) return gated.error;
      const { fullPath, access } = gated;

      try {
        if (await pathExists(fullPath)) {
          return failure('Path already exists');
        }

        await fs.promises.mkdir(fullPath, { recursive: true });

        const stats = await fs.promises.stat(fullPath);
        audit(projectId, 'write', relativePath, access);
        return success({
          name: path.basename(relativePath),
          path: relativePath,
          isDirectory: true,
          isSymlink: false,
          modifiedAt: stats.mtime.toISOString(),
          size: 0,
          children: [],
        });
      } catch (error) {
        return failure(`Failed to create folder: ${error}`);
      }
    },

    /**
     * Create a new file with optional content.
     */
    async createFile(projectId: string, relativePath: string, content = ''): AsyncResult<FileNode> {
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }

      if ('error' in gated) return gated.error;
      const { fullPath, access } = gated;

      try {
        if (await pathExists(fullPath)) {
          return failure('Path already exists');
        }

        // Ensure parent directory exists
        await ensureParentDirectory(fullPath);

        await fs.promises.writeFile(fullPath, content, 'utf-8');
        void deps.fileSummaryService?.processFile(projectId, relativePath, content);
        audit(projectId, 'write', relativePath, access);
        return success(await getScopedEntryInfo(fullPath, relativePath));
      } catch (error) {
        return failure(`Failed to create file: ${error}`);
      }
    },

    /**
     * Create a symbolic link to an external path.
     * This is Mac-only for now.
     */
    async createSymlink(projectId: string, targetPath: string, linkPath: string): AsyncResult<FileNode> {
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }

      if ('error' in gated) return gated.error;
      const { fullPath: fullLinkPath } = gated;

      const targetCheck = await checkExternalTargetAllowed(targetPath);
      if (!targetCheck.allowed) {
        return failure(targetCheck.reason ?? 'Symlink target is not allowed');
      }

      try {
        let targetStats: fs.Stats;
        try {
          targetStats = await fs.promises.stat(targetPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return failure('Target path does not exist');
          }
          throw error;
        }

        if (await pathExists(fullLinkPath)) {
          return failure('Link path already exists');
        }

        await ensureParentDirectory(fullLinkPath);
        await fs.promises.symlink(targetPath, fullLinkPath);

        const info = await getScopedEntryInfo(fullLinkPath, linkPath);
        // A symlink always points outside the link site; audit with the
        // resolved target so the activity feed shows where writes will land.
        audit(projectId, 'create-symlink', linkPath, {
          allowed: true,
          external: true,
          realpath: targetCheck.realpath,
        });
        return success({
          ...info,
          isDirectory: targetStats.isDirectory(),
          symlinkTarget: targetPath,
          isSymlinkBroken: false,
        });
      } catch (error) {
        return failure(`Failed to create symlink: ${error}`);
      }
    },

    /**
     * Delete a file or folder (recursively for folders).
     */
    async deleteEntry(projectId: string, relativePath: string): AsyncResult<void> {
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }


        return failure('Cannot delete project root');
      }

      // Prevent deleting protected paths (project context files)
      const baseName = path.basename(relativePath);
      if (baseName === 'AGENTS.md' || baseName === 'CLAUDE.md') {
        return failure(`Cannot delete ${baseName}`);
      }

      try {
        let stats: fs.Stats;
        try {
          stats = await fs.promises.lstat(fullPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return failure('Path does not exist');
          }
          throw error;
        }

        if (stats.isDirectory() && !stats.isSymbolicLink()) {
          // Recursively delete directory
          await fs.promises.rm(fullPath, { recursive: true, force: true });
        } else {
          // Delete file or symlink
          await fs.promises.unlink(fullPath);
        }

        if (stats.isDirectory() && !stats.isSymbolicLink()) {
          deps.fileSummaryService?.deleteFolder(projectId, relativePath);
        } else {
          deps.fileSummaryService?.deleteEntry(projectId, relativePath);
        }

        return success(undefined);
      } catch (error) {
        return failure(`Failed to delete: ${error}`);
      }
    },

    /**
     * Rename or move a file/folder.
     */
    async rename(projectId: string, oldPath: string, newPath: string): AsyncResult<FileNode> {
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }


      try {
        }

        // Detect case-only renames on case-insensitive filesystems (e.g. macOS):
        // "Archive" -> "archive" reports destination as existing because the OS
        // treats them as the same path. Compare inodes to distinguish.
        let isCaseOnlyRename = false;

        if (await pathExists(newFullPath)) {
          const newStat = await fs.promises.stat(newFullPath);
          isCaseOnlyRename = oldStat.ino === newStat.ino && oldStat.dev === newStat.dev;
          if (!isCaseOnlyRename) {
            return failure('Destination path already exists');
          }
        }

        // Ensure parent directory of destination exists
        await ensureParentDirectory(newFullPath);

        if (isCaseOnlyRename) {
          // Direct rename is a no-op on case-insensitive FS; use a temporary intermediate name
          await fs.promises.rename(tmpPath, newFullPath);
        } else {
        }

        const node = await getScopedEntryInfo(newFullPath, newPath, path.basename(projectFolder));
        if (node.isDirectory && !node.isSymlink) {
          deps.fileSummaryService?.deleteFolder(projectId, oldPath);
        } else {
          deps.fileSummaryService?.deleteEntry(projectId, oldPath);
          if (!node.isSymlink) {
            void deps.fileSummaryService?.processFileFromDisk(projectId, newPath, newFullPath);
          }
        }

        }
        return success(node);
      } catch (error) {
        return failure(`Failed to rename: ${error}`);
      }
    },

    /**
     * Get information about a single file/folder.
     */
    async getInfo(projectId: string, relativePath: string): AsyncResult<FileNode> {
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }


      try {
        if (!(await pathExists(fullPath))) {
          return failure('Path does not exist');
        }

        return success(await getScopedEntryInfo(fullPath, relativePath, path.basename(projectFolder)));
      } catch (error) {
        return failure(`Failed to get info: ${error}`);
      }
    },

    /**
     * Resolve a project-relative path to a validated absolute path.
     */
    async getFullPath(projectId: string, relativePath: string): AsyncResult<string> {
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }


      if (!(await pathExists(fullPath))) {
        return failure('Path does not exist');
      }

      return success(fullPath);
    },

    /**
     * Read file content asynchronously to avoid blocking the main process.
     */
    async readFileAsync(projectId: string, relativePath: string): AsyncResult<string> {
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }

      if ('error' in gated) return gated.error;
      const { fullPath } = gated;

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
     * Read binary file content (images, PDFs, etc.).
     * Returns a Buffer which serializes to Uint8Array over IPC.
     */
    async readBinaryFile(projectId: string, relativePath: string): AsyncResult<Buffer> {
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }

      if ('error' in gated) return gated.error;
      const { fullPath } = gated;

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

        const content = await fs.promises.readFile(fullPath);
        return success(content);
      } catch (error) {
        return failure(`Failed to read binary file: ${error}`);
      }
    },

    /**
     * Write file content.
     */
    async writeFile(projectId: string, relativePath: string, content: string): AsyncResult<void> {
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }

      if ('error' in gated) return gated.error;
      const { fullPath, access } = gated;

      const finalContent = maybeRewritePlanRefsForDisk(
        projectId,
        projectFolder,
        relativePath,
        content,
        deps,
      );

      try {
        // Ensure parent directory exists
        await ensureParentDirectory(fullPath);

        await fs.promises.writeFile(fullPath, finalContent, 'utf-8');
        void deps.fileSummaryService?.processFile(projectId, relativePath, finalContent);
        audit(projectId, 'write', relativePath, access);
        return success(undefined);
      } catch (error) {
        return failure(`Failed to write file: ${error}`);
      }
    },

    /**
     * Create a new binary file (images, PDFs, etc.) asynchronously.
     * Avoids blocking the main process for large writes.
     */
    async createBinaryFileAsync(
      projectId: string,
      relativePath: string,
      data: Buffer
    ): Promise<ServiceResult<FileNode>> {
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }

      if ('error' in gated) return gated.error;
      const { fullPath, access } = gated;

      try {
        if (data.byteLength > MAX_BINARY_BYTES) {
          const sizeMB = (data.byteLength / (1024 * 1024)).toFixed(1);
          return failure(`File too large (${sizeMB}MB). Max ${MAX_BINARY_BYTES / (1024 * 1024)}MB.`);
        }

        const exists = await pathExists(fullPath);
        if (exists) {
          return failure('Path already exists');
        }

        await ensureParentDirectory(fullPath);
        await fs.promises.writeFile(fullPath, data);

        const stats = await fs.promises.stat(fullPath);
        audit(projectId, 'write', relativePath, access);
        return success({
          name: path.basename(relativePath),
          path: relativePath,
          isDirectory: false,
          isSymlink: false,
          modifiedAt: stats.mtime.toISOString(),
          size: stats.size,
        });
      } catch (error) {
        return failure(`Failed to create binary file: ${error}`);
      }
    },

    /**
     * Copy an external file into the project without loading it into the renderer.
     */
    async copyExternalFile(
      projectId: string,
      sourcePath: string,
      relativePath: string
    ): Promise<ServiceResult<FileNode>> {
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }

      if ('error' in gated) return gated.error;
      const { fullPath, access } = gated;

      const sourceCheck = await checkExternalTargetAllowed(sourcePath);
      if (!sourceCheck.allowed) {
        return failure(sourceCheck.reason ?? 'Source path is not allowed');
      }

      try {
        const sourceStats = await fs.promises.stat(sourcePath);
        if (!sourceStats.isFile()) {
          return failure('Source path is not a file');
        }

        if (sourceStats.size > MAX_BINARY_BYTES) {
          const sizeMB = (sourceStats.size / (1024 * 1024)).toFixed(1);
          return failure(`File too large (${sizeMB}MB). Max ${MAX_BINARY_BYTES / (1024 * 1024)}MB.`);
        }

        if (path.resolve(sourcePath) === path.resolve(fullPath)) {
          return failure('Source and destination paths are the same');
        }

        const destExists = await pathExists(fullPath);
        if (destExists) {
          return failure('Path already exists');
        }

        await ensureParentDirectory(fullPath);
        await fs.promises.copyFile(sourcePath, fullPath, fs.constants.COPYFILE_EXCL);

        const stats = await fs.promises.stat(fullPath);
        void deps.fileSummaryService?.processFileFromDisk(projectId, relativePath, fullPath);
        audit(projectId, 'copy-into', relativePath, access);
        return success({
          name: path.basename(relativePath),
          path: relativePath,
          isDirectory: false,
          isSymlink: false,
          modifiedAt: stats.mtime.toISOString(),
          size: stats.size,
        });
      } catch (error) {
        return failure(`Failed to copy file: ${error}`);
      }
    },

    /**
     * Check if a path is a symlink and get its target.
     */
    async getSymlinkInfo(
      projectId: string,
      relativePath: string
    ): AsyncResult<{ isSymlink: boolean; target?: string; isBroken?: boolean }> {
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }


      try {
        let stats: fs.Stats;
        try {
          stats = await fs.promises.lstat(fullPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return failure('Path does not exist');
          }
          throw error;
        }

        if (!stats.isSymbolicLink()) {
          return success({ isSymlink: false });
        }

        const target = await fs.promises.readlink(fullPath);
        let isBroken = false;
        try {
          await fs.promises.stat(fullPath);
        } catch {
          isBroken = true;
        }

        return success({ isSymlink: true, target, isBroken });
      } catch (error) {
        return failure(`Failed to get symlink info: ${error}`);
      }
    },
  };
}

/**
 * If the file being written is markdown and its project folder lives inside
 * a git repo, rewrite `@plan/<uuid>` tokens to the persisted
 * `[<title>](@plan/<uuid>)` form. No-op for non-markdown files, folders
 * with no enclosing `.git`, or when the plan-items lookup wasn't supplied.
 */
function maybeRewritePlanRefsForDisk(
  projectId: string,
  projectFolder: string,
  relativePath: string,
  content: string,
  deps: FileExplorerServiceDeps,
): string {
  if (!deps.getPlanItems) return content;
  if (!MARKDOWN_EXT_REGEX.test(relativePath)) return content;
  if (!findEnclosingGitRoot(projectFolder)) return content;
  const planItems = deps.getPlanItems(projectId);
  if (planItems.length === 0) return content;
  return resolvePlanRefs(content, planItems, 'shared-doc');
}

// =============================================================================
// Type Export
// =============================================================================

export type FileExplorerService = ReturnType<typeof createFileExplorerService>;
