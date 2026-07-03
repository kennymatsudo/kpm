/**
 * Repo files domain endpoint registry.
 *
 * One entry per `repo-files:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.repoFiles`. Handles file operations within connected
 * repositories for the workspace view.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { relativePath } from './relativePath';
import { uuid } from './sharedSchemas';

export const repoFilesEndpoints = {
  listDirectory: {
    channel: 'repo-files:list-directory',
    params: z.object({
      repoId: uuid,
      path: relativePath.optional(),
      recursive: z.boolean().optional(),
      depth: z.number().int().min(1).max(20).optional(),
    }),
  },
  readFile: {
    channel: 'repo-files:read-file',
    params: z.object({ repoId: uuid, path: relativePath.min(1) }),
  },
  writeFile: {
    channel: 'repo-files:write-file',
    params: z.object({ repoId: uuid, path: relativePath.min(1), content: z.string() }),
  },
  getInfo: {
    channel: 'repo-files:get-info',
    params: z.object({ repoId: uuid, path: relativePath.min(1) }),
  },
  showItemInFolder: {
    channel: 'repo-files:show-item-in-folder',
    params: z.object({ repoId: uuid, path: relativePath.min(1) }),
  },
} satisfies Record<string, EndpointDefinition>;

export type RepoFilesEndpoints = typeof repoFilesEndpoints;
export type RepoFilesEndpointName = keyof RepoFilesEndpoints;
