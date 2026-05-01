import * as fs from 'fs/promises';
import * as path from 'path';
import type { AttachmentService } from '../../services/core/AttachmentService';
import { unwrapOrThrow } from '../../services/result';
import { toIpcResponse } from '../response';
import { AttachmentSchemas, ChatAttachmentSchemas } from '../validation';
import { IPC_CHANNELS } from '../channels';
import {
  classifyAttachment,
  saveTempAttachment,
  readAttachmentAsDataUrl,
} from '../../services/files/TempImageService';

interface PickedAttachment {
  path: string;
  filename: string;
  kind: 'image' | 'pdf' | 'text';
  mediaType: string;
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

  /**
   * Open a file picker scoped to chat attachments. Reads each selected file,
   * persists it to the temp attachments cache, and returns metadata for the
   * renderer's composer chip rendering. Errors per-file are surfaced in the
   * `errors` array so the user gets feedback on partial failures.
   */
  ipcMain.handle(IPC_CHANNELS.attachment.pickForChat, async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      return { picked: [] as PickedAttachment[], errors: [] as { filename: string; error: string }[] };
    }

    const result = await dialog.showOpenDialog(mainWindow, {
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

    const picked: PickedAttachment[] = [];
    const errors: { filename: string; error: string }[] = [];

    for (const sourcePath of result.filePaths) {
      const filename = path.basename(sourcePath);
      const classification = classifyAttachment(filename);
      if (!classification) {
        errors.push({
          filename,
          error: 'Unsupported file type. Allowed: images (PNG/JPEG/GIF/WebP), PDF, text/markdown/JSON/YAML.',
        });
        continue;
      }
      try {
        const data = await fs.readFile(sourcePath);
        const saved = await saveTempAttachment(data, filename, classification.mediaType);
        if (!saved.success) {
          errors.push({ filename, error: saved.error });
          continue;
        }
        picked.push({
          path: saved.path,
          filename: saved.filename,
          kind: saved.kind,
          mediaType: saved.mediaType,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to read file';
        errors.push({ filename, error: message });
      }
    }

    return { picked, errors };
  });

  /**
   * Persist a file dropped onto the renderer (OS drag-drop) into the temp
   * attachments cache. The renderer hands raw bytes + the original name so we
   * can reuse the same classification + size limits as the picker path.
   */
  ipcMain.handle(IPC_CHANNELS.attachment.saveDropped, async (_event, params: unknown) => {
    const { data, filename, mimeType } = ChatAttachmentSchemas.saveDropped.parse(params);
    const buffer = Buffer.from(data);
    return saveTempAttachment(buffer, filename, mimeType);
  });

  /**
   * Read a temp attachment as a base64 data URL so the renderer can show
   * thumbnails inside the CSP that blocks `file://`. Cap is enforced inside
   * the service (see `readAttachmentAsDataUrl`).
   */
  ipcMain.handle(IPC_CHANNELS.attachment.readAsDataUrl, async (_event, params: unknown) => {
    const { filePath, mediaType } = ChatAttachmentSchemas.readAsDataUrl.parse(params);
    return readAttachmentAsDataUrl(filePath, mediaType);
  });
}
