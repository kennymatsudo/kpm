/**
 * Project, Repository, Attachment, and Storybook Validation Schemas
 */

import { z } from 'zod';
import * as fs from 'fs';
import { absolutePath } from './shared';
import { attachmentEndpoints } from '../../../shared/ipc/attachmentEndpoints';
import { storybookEndpoints } from '../../../shared/ipc/storybookEndpoints';
import { projectEndpoints } from '../../../shared/ipc/projectEndpoints';
import { repoEndpoints } from '../../../shared/ipc/repoEndpoints';

// =============================================================================
// Project Schemas
// =============================================================================

export const ProjectSchemas = {
  create: projectEndpoints.create.params,
  get: projectEndpoints.get.params,
  update: projectEndpoints.update.params,
  delete: projectEndpoints.delete.params,
  openFolder: projectEndpoints.openFolder.params,
};

// =============================================================================
// Repository Schemas
//
// `repoEndpoints`' `params` only checks each path is absolute (a shared/
// renderer-safe check); the directory-existence refine below can't be
// expressed there since `fs.statSync` is main-process-only. `handlers/repos.ts`
// parses path-carrying endpoints through these stronger schemas instead of
// the registry's own `params`.
// =============================================================================

const existingDirectoryPath = absolutePath.refine(
  (p) => {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  },
  'Directory does not exist'
);

export const RepoSchemas = {
  add: repoEndpoints.add.params.extend({ path: existingDirectoryPath }),
  remove: repoEndpoints.remove.params,
  list: repoEndpoints.list.params,
  getBranch: repoEndpoints.getBranch.params.extend({ path: existingDirectoryPath }),
  getBranches: repoEndpoints.getBranches.params.extend({ paths: z.array(existingDirectoryPath) }),
  watch: repoEndpoints.watch.params.extend({ path: existingDirectoryPath }),
  unwatch: repoEndpoints.unwatch.params.extend({ path: existingDirectoryPath }),
  updateEnvironmentMode: repoEndpoints.updateEnvironmentMode.params,
  listDirectories: repoEndpoints.listDirectories.params.extend({ repoPath: existingDirectoryPath }),
  listAllBranches: repoEndpoints.listAllBranches.params.extend({ repoPath: existingDirectoryPath }),
  listWorktrees: repoEndpoints.listWorktrees.params.extend({ repoPath: existingDirectoryPath }),
  setActiveWorktreePath: repoEndpoints.setActiveWorktreePath.params,
  showInFolder: repoEndpoints.showInFolder.params,
  openEditor: repoEndpoints.openEditor.params,
};

// =============================================================================
// Attachment Schemas
//
// Payload schemas are owned by `shared/ipc/attachmentEndpoints.ts` (one entry
// per IPC endpoint, shared with the preload bridge and the handler binding).
// `add`'s registry schema validates `path` is absolute but can't also check
// the file exists on disk (`fs.statSync` is main-process-only, not
// derivable in shared/renderer code) — that existence check is layered back
// on here, same as it was pre-migration.
// =============================================================================

export const AttachmentSchemas = {
  add: attachmentEndpoints.add.params.extend({
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
  }),

  remove: attachmentEndpoints.remove.params,

  list: attachmentEndpoints.list.params,
};

// =============================================================================
// Storybook Schemas
// =============================================================================

export const StorybookSchemas = {
  updateUrl: storybookEndpoints.updateUrl.params,
  testConnection: storybookEndpoints.testConnection.params,
};
