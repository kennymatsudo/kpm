import type { AttachmentService } from '../../services/core/AttachmentService';
import { unwrapOrThrow } from '../../services/result';
import { toIpcResponse } from '../response';

/**
 * Register attachment handlers.
 * @param getMainWindow window getter for dialogs
 * @param attachmentService injectable service
 */
export function registerAttachmentHandlers(
  getMainWindow: () => BrowserWindow | null,
  attachmentService: AttachmentService
): void {
    const { projectId, path: sourcePath, filename } = AttachmentSchemas.add.parse(params);

    return unwrapOrThrow(await attachmentService.add(projectId, sourcePath, filename));
  });

    const { attachmentId } = AttachmentSchemas.remove.parse(params);

    const result = await attachmentService.remove(attachmentId);
    return toIpcResponse(result);
  });

    const { projectId } = AttachmentSchemas.list.parse(params);
    return unwrapOrThrow(attachmentService.list(projectId));
  });

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
