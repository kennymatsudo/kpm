/**
 * File explorer domain endpoint registry.
 *
 * One entry per `file-explorer:*` IPC endpoint, keyed by the dotted method
 * path used on `window.api.fileExplorer`. `file-explorer:file-changed` and
 * `file-explorer:external-access` are events (`ipcRenderer.on`), not invoke
 * endpoints, so they stay hand-declared in `src/preload/api.ts`.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { relativePath } from './relativePath';
import { absolutePath, uuid } from './sharedSchemas';

const MAX_BINARY_BYTES = 50 * 1024 * 1024; // 50MB

export const fileExplorerEndpoints = {
  listDirectory: {
    channel: 'file-explorer:list-directory',
    params: z.object({
      projectId: uuid,
      path: relativePath.optional(),
      recursive: z.boolean().optional(),
      depth: z.number().int().min(1).max(20).optional(),
    }),
  },
  createFolder: {
    channel: 'file-explorer:create-folder',
    params: z.object({ projectId: uuid, path: relativePath.min(1) }),
  },
  createFile: {
    channel: 'file-explorer:create-file',
    params: z.object({
      projectId: uuid,
      path: relativePath.min(1),
      content: z.string().max(10000000).optional(), // 10MB max
    }),
  },
  createBinaryFile: {
    channel: 'file-explorer:create-binary-file',
    params: z.object({
      projectId: uuid,
      path: relativePath.min(1),
      data: z.instanceof(Uint8Array).refine(
        (data) => data.byteLength <= MAX_BINARY_BYTES,
        `File too large (max ${MAX_BINARY_BYTES / (1024 * 1024)}MB)`
      ),
    }),
  },
  copyExternalFile: {
    channel: 'file-explorer:copy-external-file',
    params: z.object({ projectId: uuid, sourcePath: absolutePath, path: relativePath.min(1) }),
  },
  createSymlink: {
    channel: 'file-explorer:create-symlink',
    params: z.object({ projectId: uuid, targetPath: z.string().min(1), linkPath: relativePath.min(1) }),
  },
  delete: {
    channel: 'file-explorer:delete',
    params: z.object({ projectId: uuid, path: relativePath.min(1) }),
  },
  rename: {
    channel: 'file-explorer:rename',
    params: z.object({ projectId: uuid, oldPath: relativePath.min(1), newPath: relativePath.min(1) }),
  },
  getInfo: {
    channel: 'file-explorer:get-info',
    params: z.object({ projectId: uuid, path: relativePath }),
  },
  readFile: {
    channel: 'file-explorer:read-file',
    params: z.object({ projectId: uuid, path: relativePath.min(1) }),
  },
  readBinaryFile: {
    channel: 'file-explorer:read-binary-file',
    params: z.object({ projectId: uuid, path: relativePath.min(1) }),
  },
  writeFile: {
    channel: 'file-explorer:write-file',
    params: z.object({ projectId: uuid, path: relativePath.min(1), content: z.string().max(10000000) }), // 10MB max
  },
  getSymlinkInfo: {
    channel: 'file-explorer:get-symlink-info',
    params: z.object({ projectId: uuid, path: relativePath.min(1) }),
  },
  showItemInFolder: {
    channel: 'file-explorer:show-item-in-folder',
    params: z.object({ projectId: uuid, path: relativePath.min(1) }),
  },
  openInEditor: {
    channel: 'file-explorer:open-in-editor',
    params: z.object({ projectId: uuid, path: relativePath.min(1) }),
  },
  selectFolderDialog: {
    channel: 'file-explorer:select-folder-dialog',
    params: z.object({ title: z.string().optional() }),
  },
  watchProject: {
    channel: 'file-explorer:watch-project',
    params: z.object({ projectId: uuid }),
  },
  unwatchProject: {
    channel: 'file-explorer:unwatch-project',
    params: z.object({}),
  },
} satisfies Record<string, EndpointDefinition>;

export type FileExplorerEndpoints = typeof fileExplorerEndpoints;
export type FileExplorerEndpointName = keyof FileExplorerEndpoints;
