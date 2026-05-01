/**
 * Project, Repository, Attachment, and Storybook Validation Schemas
 */

import { z } from 'zod';
import * as fs from 'fs';
import {
  uuid,
  projectName,
  projectPhase,
  existingDirectoryPath,
  absolutePath,
} from './shared';

// =============================================================================
// Project Schemas
// =============================================================================

export const ProjectSchemas = {
  create: z.object({
    name: projectName,
  }),

  get: z.object({
    projectId: uuid,
  }),

  update: z.object({
    projectId: uuid,
    updates: z
      .object({
        name: projectName.optional(),
        phase: projectPhase.optional(),
      })
      .refine((u) => u.name !== undefined || u.phase !== undefined, 'At least one update field is required'),
  }),

  delete: z.object({
    projectId: uuid,
  }),

  openFolder: z.object({
    projectId: uuid,
  }),
};

// =============================================================================
// Repository Schemas
// =============================================================================

/** Environment mode for repo direnv/nix support */
const repoEnvironmentMode = z.enum(['auto', 'direnv', 'nix', 'none']);

export const RepoSchemas = {
  add: z.object({
    projectId: uuid,
    path: existingDirectoryPath,
  }),

  remove: z.object({
    repoId: uuid,
  }),

  list: z.object({
    projectId: uuid,
  }),

  getBranch: z.object({
    path: existingDirectoryPath,
  }),

  getBranches: z.object({
    paths: z.array(existingDirectoryPath),
  }),

  watch: z.object({
    repoId: uuid,
    path: existingDirectoryPath,
  }),

  unwatch: z.object({
    path: existingDirectoryPath,
  }),

  updateEnvironmentMode: z.object({
    repoId: uuid,
    mode: repoEnvironmentMode,
  }),

  listDirectories: z.object({
    repoPath: existingDirectoryPath,
    prefix: z.string().max(500).default(''),
    depth: z.number().int().min(1).max(20).default(20),
  }),

  listAllBranches: z.object({
    repoPath: existingDirectoryPath,
  }),

  listWorktrees: z.object({
    repoPath: existingDirectoryPath,
  }),

  setActiveWorktreePath: z.object({
    repoId: uuid,
    worktreePath: z.string().nullable(),
  }),

  showInFolder: z.object({
    repoId: uuid,
  }),
};

// =============================================================================
// Attachment Schemas
// =============================================================================

export const AttachmentSchemas = {
  add: z.object({
    projectId: uuid,
    path: absolutePath.refine(
      (p) => {
        try {
          return fs.statSync(p).isFile();
        } catch {
          return false;
        }
      },
      'Source file does not exist'
    ),
    filename: z
      .string()
      .min(1, 'Filename is required')
      .refine((f) => !f.includes('/') && !f.includes('\\'), 'Filename cannot contain path separators')
      .refine((f) => f !== '.' && f !== '..', 'Invalid filename'),
  }),

  remove: z.object({
    attachmentId: uuid,
  }),

  list: z.object({
    projectId: uuid,
  }),
};

// =============================================================================
// Storybook Schemas
// =============================================================================

export const StorybookSchemas = {
  updateUrl: z.object({
    projectId: uuid,
    storybookUrl: z.string().url('Must be a valid URL').nullable(),
  }),

  testConnection: z.object({
    url: z.string().url('Must be a valid URL'),
  }),
};
