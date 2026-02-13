import { z } from 'zod';
import { relativePath, uuid } from './shared';

/**
 * Validation schemas for repo file operations.
 * These handle file operations within connected repositories.
 */
export const RepoFileSchemas = {
  /**
   * List directory contents within a repo
   */
  listDirectory: z.object({
    repoId: uuid,
    path: relativePath.optional(),
    recursive: z.boolean().optional(),
    depth: z.number().int().min(1).max(20).optional(),
  }),

  /**
   * Read file content from a repo
   */
  readFile: z.object({
    repoId: uuid,
    path: relativePath.min(1),
  }),

  /**
   * Write file content to a repo (markdown/text files only)
   */
  writeFile: z.object({
    repoId: uuid,
    path: relativePath.min(1),
    content: z.string(),
  }),

  /**
   * Get info about a single file/folder
   */
  getInfo: z.object({
    repoId: uuid,
    path: relativePath.min(1),
  }),
};

// Type exports for use in handlers
export type RepoFileListDirectoryInput = z.infer<typeof RepoFileSchemas.listDirectory>;
export type RepoFileReadFileInput = z.infer<typeof RepoFileSchemas.readFile>;
export type RepoFileWriteFileInput = z.infer<typeof RepoFileSchemas.writeFile>;
export type RepoFileGetInfoInput = z.infer<typeof RepoFileSchemas.getInfo>;
