/**
 * Temp Image IPC Handlers
 *
 * Handles saving and deleting ephemeral images pasted into chat inputs.
 * Images are stored in OS temp directory, not in project folders.
 */

import { ipcMain } from 'electron';
import * as TempImageService from '../../services/files/TempImageService';
import { TempImageSchemas } from '../validation';

export function registerTempImageHandlers(): void {
  /**
   * Save a pasted image to the temp directory.
   * Returns the absolute path and filename on success.
   */
    const { imageData, format } = TempImageSchemas.save.parse(params);

    // Convert Uint8Array to Buffer
    const buffer = Buffer.from(imageData);

    return TempImageService.savePastedImage(buffer, format);
  });

  /**
   * Delete a specific temp image.
   * Used when user clicks X on an image badge before sending.
   */
    const { filePath } = TempImageSchemas.delete.parse(params);

    try {
      await TempImageService.deleteImage(filePath);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  });
}
