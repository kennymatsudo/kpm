/**
 * Confluence IPC Handlers
 *
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../channels';
import { ConfluenceSchemas } from '../validation/confluence';
import { toIpcResponse, ipcSuccess, ipcError } from '../response';
import type { ConfluenceSyncService } from '../../services/confluence';

export function registerConfluenceHandlers(
  confluenceSyncService: ConfluenceSyncService
): void {
  // Link document to Confluence page
  ipcMain.handle(IPC_CHANNELS.confluence.link, async (_event, params: unknown) => {
    const { projectId, documentPath, confluenceUrl } = ConfluenceSchemas.link.parse(params);
    const result = await confluenceSyncService.linkDocument(projectId, documentPath, confluenceUrl);
    return toIpcResponse(result);
  });

  // Unlink document
  ipcMain.handle(IPC_CHANNELS.confluence.unlink, (_event, params: unknown) => {
    const { projectId, documentPath } = ConfluenceSchemas.unlink.parse(params);
    return toIpcResponse(confluenceSyncService.unlinkDocument(projectId, documentPath));
  });

  // Get all links for project
  ipcMain.handle(IPC_CHANNELS.confluence.getLinks, (_event, params: unknown) => {
    const { projectId } = ConfluenceSchemas.getLinks.parse(params);
    return ipcSuccess(confluenceSyncService.getLinksForProject(projectId));
  });

  // Get link for a specific document
  ipcMain.handle(IPC_CHANNELS.confluence.getLinkForDocument, (_event, params: unknown) => {
    const { projectId, documentPath } = ConfluenceSchemas.getLinkForDocument.parse(params);
    const link = confluenceSyncService.getLinkForDocument(projectId, documentPath);
    return ipcSuccess(link);
  });

  // Generate sync preview
  ipcMain.handle(IPC_CHANNELS.confluence.syncPreview, async (_event, params: unknown) => {
    const { projectId, documentPath } = ConfluenceSchemas.syncPreview.parse(params);
    const result = await confluenceSyncService.generateSyncPreview(projectId, documentPath);
    return toIpcResponse(result);
  });

  // Execute push
  ipcMain.handle(IPC_CHANNELS.confluence.pushExecute, async (_event, params: unknown) => {
    const { projectId, documentPath } = ConfluenceSchemas.pushExecute.parse(params);
    const result = await confluenceSyncService.executePush(projectId, documentPath);
    return toIpcResponse(result);
  });

  // Execute pull
  ipcMain.handle(IPC_CHANNELS.confluence.pullExecute, async (_event, params: unknown) => {
    const { projectId, documentPath } = ConfluenceSchemas.pullExecute.parse(params);
    const result = await confluenceSyncService.executePull(projectId, documentPath);
    return toIpcResponse(result);
  });

  // Parse URL (for validation before linking)
  ipcMain.handle(IPC_CHANNELS.confluence.parseUrl, (_event, params: unknown) => {
    const { url } = ConfluenceSchemas.parseUrl.parse(params);
    const parsed = confluenceSyncService.parseUrl(url);
    if (parsed) {
      return ipcSuccess(parsed);
    } else {
      return ipcError('Invalid Confluence URL');
    }
  });
}
