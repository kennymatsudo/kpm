/**
 * File explorer domain event registry (main -> renderer push events).
 *
 * Covers `file-explorer:file-changed` (emitted from `ProjectWatcherService`,
 * `handlers/fileExplorer.ts`, and the `file-move` Claude tool) and
 * `file-explorer:external-access` (emitted from `repoServices.ts`'s
 * cross-boundary write/delete/rename/symlink guard). Not invoke endpoints —
 * see `fileExplorerEndpoints.ts` for the invoke surface.
 */

import { payloadOf, type EventDefinition } from './appEvents';

export interface FileExplorerFileChangedEventData {
  projectId: string;
  type: 'created' | 'updated' | 'deleted' | 'renamed';
  path: string;
  newPath?: string;
  isDirectory: boolean;
}

export interface FileExplorerExternalAccessEventData {
  projectId: string;
  op: 'write' | 'delete' | 'rename' | 'create-symlink' | 'copy-into';
  relativePath: string;
  realpath: string;
}

export const fileExplorerEvents = {
  fileChanged: { channel: 'file-explorer:file-changed', payload: payloadOf<FileExplorerFileChangedEventData>() },
  externalAccess: { channel: 'file-explorer:external-access', payload: payloadOf<FileExplorerExternalAccessEventData>() },
} satisfies Record<string, EventDefinition>;

export type FileExplorerEvents = typeof fileExplorerEvents;
export type FileExplorerEventName = keyof FileExplorerEvents;
