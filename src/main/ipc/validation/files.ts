/**
 * File and File Explorer Validation Schemas
 */

import { z } from 'zod';
import { existingFilePath, uuid, relativePath } from './shared';

const MAX_BINARY_BYTES = 50 * 1024 * 1024; // 50MB

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
    path: relativePath.min(1).max(255),
  }),

  writeContext: z.object({
    projectId: uuid,
    path: relativePath.min(1).max(255),
    content: z.string().max(1000000, 'Content too large (max 1MB)'),
  }),

  deleteContext: z.object({
    projectId: uuid,
    path: relativePath.min(1).max(255),
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

  createBinaryFile: z.object({
    projectId: uuid,
    path: relativePath.min(1),
    data: z.instanceof(Uint8Array).refine(
      (data) => data.byteLength <= MAX_BINARY_BYTES,
      `File too large (max ${MAX_BINARY_BYTES / (1024 * 1024)}MB)`
    ),
  }),

  copyExternalFile: z.object({
    projectId: uuid,
    sourcePath: existingFilePath,
    path: relativePath.min(1),
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

  readBinaryFile: z.object({
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

  watchProject: z.object({
    projectId: uuid,
  }),

  unwatchProject: z.object({}),
};
