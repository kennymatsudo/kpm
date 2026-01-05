import { z } from 'zod';

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
    recursive: z.boolean().optional(),
    depth: z.number().int().min(1).max(20).optional(),
  }),

  /**
   * Read file content from a repo
   */
  readFile: z.object({
    repoId: uuid,
  }),

  /**
   * Write file content to a repo (markdown/text files only)
   */
  writeFile: z.object({
    repoId: uuid,
    content: z.string(),
  }),

  /**
   * Get info about a single file/folder
   */
  getInfo: z.object({
    repoId: uuid,
  }),
};

// Type exports for use in handlers
export type RepoFileListDirectoryInput = z.infer<typeof RepoFileSchemas.listDirectory>;
export type RepoFileReadFileInput = z.infer<typeof RepoFileSchemas.readFile>;
export type RepoFileWriteFileInput = z.infer<typeof RepoFileSchemas.writeFile>;
export type RepoFileGetInfoInput = z.infer<typeof RepoFileSchemas.getInfo>;
