import type { AttachmentService } from '../../services/core/AttachmentService';
import { unwrapOrThrow } from '../../services/result';
import { toIpcResponse } from '../response';
import { IPC_CHANNELS } from '../channels';

/**
 * Register attachment handlers.
 * @param getMainWindow window getter for dialogs
 * @param attachmentService injectable service
 */
export function registerAttachmentHandlers(
  getMainWindow: () => BrowserWindow | null,
  attachmentService: AttachmentService
): void {
  ipcMain.handle(IPC_CHANNELS.attachment.add, async (_event, params: unknown) => {
    const { projectId, path: sourcePath, filename } = AttachmentSchemas.add.parse(params);

    return unwrapOrThrow(await attachmentService.add(projectId, sourcePath, filename));
  });

  ipcMain.handle(IPC_CHANNELS.attachment.remove, async (_event, params: unknown) => {
    const { attachmentId } = AttachmentSchemas.remove.parse(params);

    const result = await attachmentService.remove(attachmentId);
    return toIpcResponse(result);
  });

  ipcMain.handle(IPC_CHANNELS.attachment.list, (_event, params: unknown) => {
    const { projectId } = AttachmentSchemas.list.parse(params);
    return unwrapOrThrow(attachmentService.list(projectId));
  });

  ipcMain.handle(IPC_CHANNELS.attachment.selectDialog, async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return [];

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      title: 'Select Files',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return [];
    }
    return result.filePaths;
  });
}
