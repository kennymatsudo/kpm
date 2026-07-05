/**
 * File explorer domain endpoint registry.
 *
 * One entry per `file-explorer:*` IPC endpoint, keyed by the dotted method
 * path used on `window.api.fileExplorer`. `file-explorer:file-changed` and
 * `file-explorer:external-access` are events (`ipcRenderer.on`), not invoke
 * endpoints, so they stay hand-declared in `src/preload/api.ts`.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { relativePath } from './relativePath';
import { absolutePath, uuid } from './sharedSchemas';
import type { FileNode } from '../types';

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
    result: resultOf<FileNode[]>(),
  },
  createFolder: {
    channel: 'file-explorer:create-folder',
    params: z.object({ projectId: uuid, path: relativePath.min(1) }),
    result: resultOf<FileNode>(),
  },
  createFile: {
    channel: 'file-explorer:create-file',
    params: z.object({
      projectId: uuid,
      path: relativePath.min(1),
      content: z.string().max(10000000).optional(), // 10MB max
    }),
    result: resultOf<FileNode>(),
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
    result: resultOf<FileNode>(),
  },
  copyExternalFile: {
    channel: 'file-explorer:copy-external-file',
    params: z.object({ projectId: uuid, sourcePath: absolutePath, path: relativePath.min(1) }),
    result: resultOf<FileNode>(),
  },
  createSymlink: {
    channel: 'file-explorer:create-symlink',
    params: z.object({ projectId: uuid, targetPath: z.string().min(1), linkPath: relativePath.min(1) }),
    result: resultOf<FileNode>(),
  },
  delete: {
    channel: 'file-explorer:delete',
    params: z.object({ projectId: uuid, path: relativePath.min(1) }),
    result: resultOf<{ success: boolean; error?: string }>(),
  },
  rename: {
    channel: 'file-explorer:rename',
    params: z.object({ projectId: uuid, oldPath: relativePath.min(1), newPath: relativePath.min(1) }),
    result: resultOf<FileNode>(),
  },
  getInfo: {
    channel: 'file-explorer:get-info',
    params: z.object({ projectId: uuid, path: relativePath }),
    result: resultOf<FileNode>(),
  },
  readFile: {
    channel: 'file-explorer:read-file',
    params: z.object({ projectId: uuid, path: relativePath.min(1) }),
    result: resultOf<string>(),
  },
  readBinaryFile: {
    channel: 'file-explorer:read-binary-file',
    params: z.object({ projectId: uuid, path: relativePath.min(1) }),
    // The handler returns a Node `Buffer`, but Electron's structured clone
    // delivers it to the renderer as a `Uint8Array` on the wire.
    result: resultOf<Uint8Array>(),
  },
  writeFile: {
    channel: 'file-explorer:write-file',
    params: z.object({ projectId: uuid, path: relativePath.min(1), content: z.string().max(10000000) }), // 10MB max
    result: resultOf<{ success: boolean; error?: string }>(),
  },
  getSymlinkInfo: {
    channel: 'file-explorer:get-symlink-info',
    params: z.object({ projectId: uuid, path: relativePath.min(1) }),
    result: resultOf<{ isSymlink: boolean; target?: string; isBroken?: boolean }>(),
  },
  showItemInFolder: {
    channel: 'file-explorer:show-item-in-folder',
    params: z.object({ projectId: uuid, path: relativePath.min(1) }),
    result: resultOf<{ success: true }>(),
  },
  openInEditor: {
    channel: 'file-explorer:open-in-editor',
    params: z.object({ projectId: uuid, path: relativePath.min(1) }),
    result: resultOf<{ success: boolean; error?: string }>(),
  },
  selectFolderDialog: {
    channel: 'file-explorer:select-folder-dialog',
    params: z.object({ title: z.string().optional() }),
    result: resultOf<string | null>(),
  },
  watchProject: {
    channel: 'file-explorer:watch-project',
    params: z.object({ projectId: uuid }),
    result: resultOf<{ success: boolean; error?: string }>(),
  },
  unwatchProject: {
    channel: 'file-explorer:unwatch-project',
    params: z.object({}),
    result: resultOf<{ success: true }>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type FileExplorerEndpoints = typeof fileExplorerEndpoints;
export type FileExplorerEndpointName = keyof FileExplorerEndpoints;
