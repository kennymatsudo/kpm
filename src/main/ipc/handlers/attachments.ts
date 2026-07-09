import { app, dialog, shell, type BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import { attachmentEndpoints, type AttachmentEndpointName } from '../../../shared/ipc/attachmentEndpoints';
import type { HandlerFor } from '../../../shared/ipc/endpoints';
import type { AttachmentService, PickedAttachment } from '../../services/core/AttachmentService';
import { unwrapOrThrow } from '../../services/result';
import { toIpcResponse } from '../response';
import { AttachmentAddSchema } from '../validation/project';
import { ChatAttachmentReadAsDataUrlSchema, ChatAttachmentOpenTempSchema } from '../validation/artifacts';
import { saveTempAttachment, readAttachmentAsDataUrl } from '../../services/files/TempImageService';
import { bindRegistryHandlers } from '../validation/utils';

/**
 * One handler per `attachmentEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type AttachmentHandlers = { [K in AttachmentEndpointName]: HandlerFor<typeof attachmentEndpoints, K> };

function buildAttachmentHandlers(
  getMainWindow: () => BrowserWindow | null,
  attachmentService: AttachmentService
): AttachmentHandlers {
  return {
    add: async ({ projectId, path: sourcePath, filename }) =>
      unwrapOrThrow(await attachmentService.add(projectId, sourcePath, filename)),

    remove: async ({ attachmentId }) => toIpcResponse(await attachmentService.remove(attachmentId)),

    list: async ({ projectId }) => unwrapOrThrow(attachmentService.list(projectId)),

    selectDialog: async () => {
      const mainWindow = getMainWindow();
      if (!mainWindow) return [];

      const result = await dialog.showOpenDialog(mainWindow, {
        defaultPath: app.getPath('home'),
        properties: ['openFile', 'multiSelections'],
        title: 'Select Files',
      });
      if (result.canceled || result.filePaths.length === 0) {
        return [];
      }
      return result.filePaths;
    },

    /**
     * Open a file picker scoped to chat attachments. Reads each selected file,
     * persists it to the temp attachments cache, and returns metadata for the
     * renderer's composer chip rendering. Errors per-file are surfaced in the
     * `errors` array so the user gets feedback on partial failures.
     */
    pickForChat: async () => {
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        return { picked: [] as PickedAttachment[], errors: [] as { filename: string; error: string }[] };
      }

      const result = await dialog.showOpenDialog(mainWindow, {
        defaultPath: app.getPath('home'),
        properties: ['openFile', 'multiSelections'],
        title: 'Add attachments',
        filters: [
          { name: 'Supported attachments', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'md', 'markdown', 'txt', 'json', 'yaml', 'yml'] },
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
          { name: 'PDF', extensions: ['pdf'] },
          { name: 'Text', extensions: ['md', 'markdown', 'txt', 'json', 'yaml', 'yml'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { picked: [] as PickedAttachment[], errors: [] as { filename: string; error: string }[] };
      }

      return unwrapOrThrow(await attachmentService.pickForChat(result.filePaths));
    },

    /**
     * Persist a file dropped onto the renderer (OS drag-drop) into the temp
     * attachments cache. The renderer hands raw bytes + the original name so we
     * can reuse the same classification + size limits as the picker path.
     */
    saveDropped: async ({ data, filename, mimeType }) => {
      const buffer = Buffer.from(data);
      return saveTempAttachment(buffer, filename, mimeType);
    },

    /**
     * Read a temp attachment as a base64 data URL so the renderer can show
     * thumbnails inside the CSP that blocks `file://`. Cap is enforced inside
     * the service (see `readAttachmentAsDataUrl`).
     */
    readAsDataUrl: async ({ filePath, mediaType }) => readAttachmentAsDataUrl(filePath, mediaType),

    /**
     * Open a temp attachment with the OS default application. The schema scopes
     * the path to KPM's temp attachment directory; lstat rejects symlink swaps.
     */
    openTemp: async ({ filePath }) => {
      const stats = await fs.lstat(filePath);
      if (stats.isSymbolicLink()) {
        return { success: false, error: 'Cannot open symlinks' };
      }

      const errorMessage = await shell.openPath(filePath);
      if (errorMessage) {
        return { success: false, error: errorMessage };
      }
      return { success: true };
    },
  };
}

/**
 * Register attachment handlers.
 * @param getMainWindow window getter for dialogs
 * @param attachmentService injectable service
 */
export function registerAttachmentHandlers(
  getMainWindow: () => BrowserWindow | null,
  attachmentService: AttachmentService
): void {
  const handlers = buildAttachmentHandlers(getMainWindow, attachmentService);

  // `AttachmentAddSchema` and `ChatAttachmentReadAsDataUrlSchema`/
  // `ChatAttachmentOpenTempSchema` layer refines the shared registry's
  // `params` can't express (file-exists / temp-dir scoping — see
  // `validation/project.ts` and `validation/artifacts.ts`), so those three
  // parse through them instead of `attachmentEndpoints[name].params`.
  const validationOverrides: Partial<Record<AttachmentEndpointName, { parse: (input: unknown) => unknown }>> = {
    add: AttachmentAddSchema,
    readAsDataUrl: ChatAttachmentReadAsDataUrlSchema,
    openTemp: ChatAttachmentOpenTempSchema,
  };

  bindRegistryHandlers(attachmentEndpoints, handlers, validationOverrides);
}
