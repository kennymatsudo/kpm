/**
 * Repo domain endpoint registry.
 *
 * One entry per `repo:*` IPC endpoint, keyed by the dotted method path used
 * on `window.api.repos`. Several endpoints take a path that must exist on
 * disk (`fs.statSync`, main-process-only, not derivable in shared/renderer
 * code), so this registry only validates the path is absolute;
 * `handlers/repos.ts` layers the existence check on top via
 * `RepoSchemas`' `existingDirectoryPath`, same as it did pre-migration.
 *
 * `repo:branch-changed` (main -> renderer event from `RepoWatcherService`) is
 * not an invoke endpoint and stays hand-written in `preload/api.ts`.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { absolutePath, uuid } from './sharedSchemas';

const repoEnvironmentMode = z.enum(['auto', 'direnv', 'nix', 'none']);

export const repoEndpoints = {
  add: {
    channel: 'repo:add',
    params: z.object({ projectId: uuid, path: absolutePath }),
  },
  remove: {
    channel: 'repo:remove',
    params: z.object({ repoId: uuid }),
  },
  list: {
    channel: 'repo:list',
    params: z.object({ projectId: uuid }),
  },
  getBranch: {
    channel: 'repo:get-branch',
    params: z.object({ path: absolutePath }),
  },
  getBranches: {
    channel: 'repo:get-branches',
    params: z.object({ paths: z.array(absolutePath) }),
  },
  watch: {
    channel: 'repo:watch',
    params: z.object({ repoId: uuid, path: absolutePath }),
  },
  unwatch: {
    channel: 'repo:unwatch',
    params: z.object({ path: absolutePath }),
  },
  updateEnvironmentMode: {
    channel: 'repo:update-environment-mode',
    params: z.object({ repoId: uuid, mode: repoEnvironmentMode }),
  },
  selectDialog: {
    channel: 'repo:select-dialog',
    params: null,
  },
  listDirectories: {
    channel: 'repo:list-directories',
    params: z.object({
      repoPath: absolutePath,
      prefix: z.string().max(500).default(''),
      depth: z.number().int().min(1).max(20).default(20),
    }),
  },
  listAllBranches: {
    channel: 'repo:list-all-branches',
    params: z.object({ repoPath: absolutePath }),
  },
  listWorktrees: {
    channel: 'repo:list-worktrees',
    params: z.object({ repoPath: absolutePath }),
  },
  setActiveWorktreePath: {
    channel: 'repo:set-active-worktree-path',
    params: z.object({ repoId: uuid, worktreePath: z.string().nullable() }),
  },
  showInFolder: {
    channel: 'repo:show-in-folder',
    params: z.object({ repoId: uuid }),
  },
  openEditor: {
    channel: 'repo:open-editor',
    params: z.object({ repoId: uuid }),
  },
} satisfies Record<string, EndpointDefinition>;

export type RepoEndpoints = typeof repoEndpoints;
export type RepoEndpointName = keyof RepoEndpoints;
