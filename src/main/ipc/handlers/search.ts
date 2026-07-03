/**
 * Search IPC Handlers
 */

import { ipcMain } from 'electron';
import { searchEndpoints, type SearchEndpointName } from '../../../shared/ipc/searchEndpoints';
import type { EndpointPayload } from '../../../shared/ipc/endpoints';
import { unwrapOrThrow } from '../../services/result';
import type { SearchService } from '../../services/core/SearchService';

type SearchHandler<K extends SearchEndpointName> = (
  params: EndpointPayload<(typeof searchEndpoints)[K]>,
  event: Electron.IpcMainInvokeEvent
) => Promise<unknown>;

/**
 * One handler per `searchEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type SearchHandlers = { [K in SearchEndpointName]: SearchHandler<K> };

function buildSearchHandlers(searchService: SearchService): SearchHandlers {
  return {
    global: async ({ projectId, query, limit }) => unwrapOrThrow(await searchService.search(projectId, query, limit)),
  };
}

export function registerSearchHandlers(searchService: SearchService): void {
  const handlers = buildSearchHandlers(searchService);

  for (const [name, { channel, params }] of Object.entries(searchEndpoints) as [
    SearchEndpointName,
    (typeof searchEndpoints)[SearchEndpointName],
  ][]) {
    // Each handler's parameter type was checked once against its own
    // registry entry in `buildSearchHandlers`; iterating erases that
    // per-key correlation into a union, hence the cast here.
    const handler = handlers[name] as (params: unknown, event: Electron.IpcMainInvokeEvent) => unknown;
    ipcMain.handle(channel, async (event, rawParams: unknown) => {
      const parsedParams = params ? params.parse(rawParams) : undefined;
      return handler(parsedParams, event);
    });
  }
}
