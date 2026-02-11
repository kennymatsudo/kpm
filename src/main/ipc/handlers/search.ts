/**
 * Search IPC Handlers
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../channels';
import { SearchSchemas } from '../validation/search';
import { unwrapOrThrow } from '../../services/result';
import type { SearchService } from '../../services/core/SearchService';

export function registerSearchHandlers(searchService: SearchService): void {
  ipcMain.handle(IPC_CHANNELS.search.global, async (_event, params: unknown) => {
    const { projectId, query, limit } = SearchSchemas.global.parse(params);
    const result = await searchService.search(projectId, query, limit);
    return unwrapOrThrow(result);
  });
}
