import type { z } from 'zod';
import { repoFilesEndpoints } from '../../../shared/ipc/repoFilesEndpoints';

/**
 * Validation schemas for repo file operations.
 * These handle file operations within connected repositories.
 *
 * Payload schemas are owned by `shared/ipc/repoFilesEndpoints.ts` (one entry
 * per IPC endpoint, shared with the preload bridge and the handler binding).
 * This map only translates the endpoint registry's dotted keys to the names
 * `RepoFileService`-adjacent callers already use.
 */
export const RepoFileSchemas = {
  listDirectory: repoFilesEndpoints.listDirectory.params,
  readFile: repoFilesEndpoints.readFile.params,
  writeFile: repoFilesEndpoints.writeFile.params,
  getInfo: repoFilesEndpoints.getInfo.params,
  showItemInFolder: repoFilesEndpoints.showItemInFolder.params,
};

// Type exports for use in handlers
export type RepoFileListDirectoryInput = z.infer<typeof RepoFileSchemas.listDirectory>;
export type RepoFileReadFileInput = z.infer<typeof RepoFileSchemas.readFile>;
export type RepoFileWriteFileInput = z.infer<typeof RepoFileSchemas.writeFile>;
export type RepoFileGetInfoInput = z.infer<typeof RepoFileSchemas.getInfo>;
export type RepoFileShowItemInFolderInput = z.infer<typeof RepoFileSchemas.showItemInFolder>;
