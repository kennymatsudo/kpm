/**
 * Repository and Attachment path-existence refines.
 *
 * `repoEndpoints`' and `attachmentEndpoints`' `params` only check each path
 * is absolute (a shared/renderer-safe check); the existence refines below
 * can't be expressed there since `fs.statSync` is main-process-only.
 * `handlers/repos.ts` and `handlers/attachments.ts` parse path-carrying
 * endpoints through these stronger schemas instead of the registry's own
 * `params`.
 */

import { z } from 'zod';
import * as fs from 'fs';
import { absolutePath } from './shared';
import { attachmentEndpoints } from '../../../shared/ipc/attachmentEndpoints';
import { repoEndpoints } from '../../../shared/ipc/repoEndpoints';

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
  getBranch: repoEndpoints.getBranch.params.extend({ path: existingDirectoryPath }),
  getBranches: repoEndpoints.getBranches.params.extend({ paths: z.array(existingDirectoryPath) }),
  watch: repoEndpoints.watch.params.extend({ path: existingDirectoryPath }),
  unwatch: repoEndpoints.unwatch.params.extend({ path: existingDirectoryPath }),
  listDirectories: repoEndpoints.listDirectories.params.extend({ repoPath: existingDirectoryPath }),
  listAllBranches: repoEndpoints.listAllBranches.params.extend({ repoPath: existingDirectoryPath }),
  listWorktrees: repoEndpoints.listWorktrees.params.extend({ repoPath: existingDirectoryPath }),
};

export const AttachmentAddSchema = attachmentEndpoints.add.params.extend({
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
});
