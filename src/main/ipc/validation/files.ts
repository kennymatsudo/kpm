/**
 * File and File Explorer Validation Schemas
 */

import { z } from 'zod';

// =============================================================================
// File Schemas (Context Files)
// =============================================================================

export const FileSchemas = {
  read: z.object({
    projectId: uuid,
  }),

  write: z.object({
    projectId: uuid,
    content: z.string().max(1000000, 'Content too large (max 1MB)'),
  }),

  listContext: z.object({
    projectId: uuid,
  }),

  readContext: z.object({
    projectId: uuid,
  }),

  writeContext: z.object({
    projectId: uuid,
    content: z.string().max(1000000, 'Content too large (max 1MB)'),
  }),

  deleteContext: z.object({
    projectId: uuid,
  }),

  importContext: z.object({
    projectId: uuid,
    sourcePath: z.string().min(1),
  }),
};

// =============================================================================
// File Explorer Schemas
// =============================================================================

export const FileExplorerSchemas = {
  listDirectory: z.object({
    projectId: uuid,
    path: relativePath.optional(),
    recursive: z.boolean().optional(),
    depth: z.number().int().min(1).max(20).optional(),
  }),

  createFolder: z.object({
    projectId: uuid,
    path: relativePath.min(1),
  }),

  createFile: z.object({
    projectId: uuid,
    path: relativePath.min(1),
    content: z.string().max(10000000).optional(), // 10MB max
  }),

  createSymlink: z.object({
    projectId: uuid,
    targetPath: z.string().min(1),
    linkPath: relativePath.min(1),
  }),

  deleteEntry: z.object({
    projectId: uuid,
    path: relativePath.min(1),
  }),

  rename: z.object({
    projectId: uuid,
    oldPath: relativePath.min(1),
    newPath: relativePath.min(1),
  }),

  getInfo: z.object({
    projectId: uuid,
    path: relativePath,
  }),

  readFile: z.object({
    projectId: uuid,
    path: relativePath.min(1),
  }),

  writeFile: z.object({
    projectId: uuid,
    path: relativePath.min(1),
    content: z.string().max(10000000), // 10MB max
  }),

  getSymlinkInfo: z.object({
    projectId: uuid,
    path: relativePath.min(1),
  }),

  selectFolderDialog: z.object({
    title: z.string().optional(),
  }),
};
