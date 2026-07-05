import { ipcMain, shell } from 'electron';
import { repoFilesEndpoints, type RepoFilesEndpointName } from '../../../shared/ipc/repoFilesEndpoints';
import type { HandlerFor } from '../../../shared/ipc/endpoints';
import type { RepoFileService } from '../../services/files/RepoFileService';
import { unwrapOrThrow } from '../../services/result';
import { toIpcResponse } from '../response';

/**
 * One handler per `repoFilesEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type RepoFilesHandlers = { [K in RepoFilesEndpointName]: HandlerFor<typeof repoFilesEndpoints, K> };

function buildRepoFilesHandlers(repoFileService: RepoFileService): RepoFilesHandlers {
  return {
    listDirectory: async ({ repoId, path, recursive, depth }) =>
      unwrapOrThrow(await repoFileService.listDirectory(repoId, path ?? '', { recursive, depth })),

    readFile: async ({ repoId, path }) => unwrapOrThrow(await repoFileService.readFileAsync(repoId, path)),

    writeFile: async ({ repoId, path, content }) => toIpcResponse(await repoFileService.writeFile(repoId, path, content)),

    getInfo: async ({ repoId, path }) => unwrapOrThrow(await repoFileService.getInfo(repoId, path)),

    showItemInFolder: async ({ repoId, path }) => {
      const fullPath = unwrapOrThrow(await repoFileService.getFullPath(repoId, path));
      shell.showItemInFolder(fullPath);
      return { success: true };
    },
  };
}

/**
 * Register IPC handlers for repo file operations.
 * These handle file operations within connected repositories for the workspace view.
 */
export function registerRepoFileHandlers(repoFileService: RepoFileService): void {
  const handlers = buildRepoFilesHandlers(repoFileService);

  for (const [name, { channel, params }] of Object.entries(repoFilesEndpoints) as [
    RepoFilesEndpointName,
    (typeof repoFilesEndpoints)[RepoFilesEndpointName],
  ][]) {
    // Each handler's parameter type was checked once against its own
    // registry entry in `buildRepoFilesHandlers`; iterating erases that
    // per-key correlation into a union, hence the cast here.
    const handler = handlers[name] as (params: unknown, event: Electron.IpcMainInvokeEvent) => unknown;
    ipcMain.handle(channel, async (event, rawParams: unknown) => {
      const parsedParams = params ? params.parse(rawParams) : undefined;
      return handler(parsedParams, event);
    });
  }
}
