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
import { resultOf, type EndpointDefinition } from './endpoints';
import { absolutePath, uuid } from './sharedSchemas';
import type { Repo } from '../types';

const repoEnvironmentMode = z.enum(['auto', 'direnv', 'nix', 'none']);

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/repos.ts`): the handler returns bare data (or
 * `void`), and the registry loop wraps it as `{success: true, ...data}` /
 * `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

export const repoEndpoints = {
  add: {
    channel: 'repo:add',
    params: z.object({ projectId: uuid, path: absolutePath }),
    result: resultOf<RegistryResponse<{ repo: Repo }>>(),
  },
  remove: {
    channel: 'repo:remove',
    params: z.object({ repoId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  list: {
    channel: 'repo:list',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse<{ repos: Repo[] }>>(),
  },
  getBranch: {
    channel: 'repo:get-branch',
    params: z.object({ path: absolutePath }),
    result: resultOf<RegistryResponse<{ branch: string | null }>>(),
  },
  getBranches: {
    channel: 'repo:get-branches',
    params: z.object({ paths: z.array(absolutePath) }),
    result: resultOf<RegistryResponse<{ branches: Record<string, string | null> }>>(),
  },
  watch: {
    channel: 'repo:watch',
    params: z.object({ repoId: uuid, path: absolutePath }),
    result: resultOf<RegistryResponse>(),
  },
  unwatch: {
    channel: 'repo:unwatch',
    params: z.object({ path: absolutePath }),
    result: resultOf<RegistryResponse>(),
  },
  updateEnvironmentMode: {
    channel: 'repo:update-environment-mode',
    params: z.object({ repoId: uuid, mode: repoEnvironmentMode }),
    result: resultOf<RegistryResponse>(),
  },
  selectDialog: {
    channel: 'repo:select-dialog',
    params: null,
    result: resultOf<RegistryResponse<{ paths: string[] }>>(),
  },
  listDirectories: {
    channel: 'repo:list-directories',
    params: z.object({
      repoPath: absolutePath,
      prefix: z.string().max(500).default(''),
      depth: z.number().int().min(1).max(20).default(20),
    }),
    result: resultOf<RegistryResponse<{ directories: string[] }>>(),
  },
  listAllBranches: {
    channel: 'repo:list-all-branches',
    params: z.object({ repoPath: absolutePath }),
    result: resultOf<RegistryResponse<{ branches: string[] }>>(),
  },
  listWorktrees: {
    channel: 'repo:list-worktrees',
    params: z.object({ repoPath: absolutePath }),
    result: resultOf<RegistryResponse<{ worktrees: { path: string; branch: string | null; isMain: boolean }[] }>>(),
  },
  setActiveWorktreePath: {
    channel: 'repo:set-active-worktree-path',
    params: z.object({ repoId: uuid, worktreePath: z.string().nullable() }),
    result: resultOf<RegistryResponse>(),
  },
  showInFolder: {
    channel: 'repo:show-in-folder',
    params: z.object({ repoId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  openEditor: {
    channel: 'repo:open-editor',
    params: z.object({ repoId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type RepoEndpoints = typeof repoEndpoints;
export type RepoEndpointName = keyof RepoEndpoints;
