/**
 * Repo files domain endpoint registry.
 *
 * One entry per `repo-files:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.repoFiles`. Handles file operations within connected
 * repositories for the workspace view.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { relativePath } from './relativePath';
import { uuid } from './sharedSchemas';
import type { FileNode } from '../types';

/**
 * Response shape for endpoints whose handler builds its own `{success, ...}`
 * envelope by hand (see `main/ipc/response.ts`'s `toIpcResponse`) rather than
 * having one applied by a registry-binding loop.
 */
type IpcResponse<T> = { success: true; data: T } | { success: false; error: string };

export const repoFilesEndpoints = {
  listDirectory: {
    channel: 'repo-files:list-directory',
    params: z.object({
      repoId: uuid,
      path: relativePath.optional(),
      recursive: z.boolean().optional(),
      depth: z.number().int().min(1).max(20).optional(),
    }),
    result: resultOf<FileNode[]>(),
  },
  readFile: {
    channel: 'repo-files:read-file',
    params: z.object({ repoId: uuid, path: relativePath.min(1) }),
    result: resultOf<string>(),
  },
  writeFile: {
    channel: 'repo-files:write-file',
    params: z.object({ repoId: uuid, path: relativePath.min(1), content: z.string() }),
    result: resultOf<IpcResponse<void>>(),
  },
  getInfo: {
    channel: 'repo-files:get-info',
    params: z.object({ repoId: uuid, path: relativePath.min(1) }),
    result: resultOf<FileNode>(),
  },
  showItemInFolder: {
    channel: 'repo-files:show-item-in-folder',
    params: z.object({ repoId: uuid, path: relativePath.min(1) }),
    result: resultOf<{ success: true }>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type RepoFilesEndpoints = typeof repoFilesEndpoints;
export type RepoFilesEndpointName = keyof RepoFilesEndpoints;
