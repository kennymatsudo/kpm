/**
 * Confluence IPC Handlers
 *
 * Handles bidirectional sync between KPM documents and Confluence pages.
 */

import { confluenceEndpoints, type ConfluenceEndpointName } from '../../../shared/ipc/confluenceEndpoints';
import type { HandlerFor } from '../../../shared/ipc/endpoints';
import type { ConfluenceSyncPreview } from '../../../shared/types';
import { toIpcResponse, ipcSuccess, ipcError } from '../response';
import type { ConfluenceSyncService } from '../../services/confluence';
import { bindRegistryHandlers } from '../validation/utils';

/**
 * One handler per `confluenceEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 * Response shapes vary per endpoint (toIpcResponse vs. ipcSuccess/ipcError)
 * so this binds directly to `ipcMain.handle` rather than going through
 * `createRegistryIpcHandlers`, which would force a uniform `{success, ...}`
 * envelope onto every entry.
 */
type ConfluenceHandlers = {
  [K in ConfluenceEndpointName]: (
    params: Parameters<HandlerFor<typeof confluenceEndpoints, K>>[0]
  ) => ReturnType<HandlerFor<typeof confluenceEndpoints, K>>;
};

function buildConfluenceHandlers(confluenceSyncService: ConfluenceSyncService): ConfluenceHandlers {
  return {
    link: async ({ projectId, documentPath, confluenceUrl }) =>
      toIpcResponse(await confluenceSyncService.linkDocument(projectId, documentPath, confluenceUrl)),

    unlink: ({ projectId, documentPath }) =>
      toIpcResponse(confluenceSyncService.unlinkDocument(projectId, documentPath)),

    getLinks: ({ projectId }) => ipcSuccess(confluenceSyncService.getLinksForProject(projectId)),

    getLinkForDocument: ({ projectId, documentPath }) =>
      ipcSuccess(confluenceSyncService.getLinkForDocument(projectId, documentPath)),

    // `generateSyncPreview`'s declared `AsyncResult<SyncPreview>` return type
    // is narrower than the object it actually constructs (also includes
    // `isInitialSync`/`hasContentDifference`, which the renderer's
    // `ConfluenceSyncPreviewModal` reads) — cast to the real, wider shape
    // rather than the stale declared one.
    syncPreview: async ({ projectId, documentPath }) =>
      toIpcResponse(
        (await confluenceSyncService.generateSyncPreview(projectId, documentPath)) as
          | { ok: true; data: ConfluenceSyncPreview }
          | { ok: false; error: string }
      ),

    pushExecute: async ({ projectId, documentPath }) =>
      toIpcResponse(await confluenceSyncService.executePush(projectId, documentPath)),

    pullExecute: async ({ projectId, documentPath }) =>
      toIpcResponse(await confluenceSyncService.executePull(projectId, documentPath)),

    parseUrl: ({ url }) => {
      const parsed = confluenceSyncService.parseUrl(url);
      return parsed ? ipcSuccess(parsed) : ipcError('Invalid Confluence URL');
    },
  };
}

export function registerConfluenceHandlers(confluenceSyncService: ConfluenceSyncService): void {
  const handlers = buildConfluenceHandlers(confluenceSyncService);
  bindRegistryHandlers(confluenceEndpoints, handlers);
}
