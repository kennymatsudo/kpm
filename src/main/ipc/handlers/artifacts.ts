/**
 */

import { ipcMain, dialog, type BrowserWindow } from 'electron';
  /**
   * List artifacts in the outputs folder
   */
  ipcMain.handle(
    createIpcHandler(
      ArtifactSchemas.list,
      async ({ projectId }) => {
      },
      'Failed to list artifacts'
    )
  );

  /**
   * Read an artifact file
   */
  ipcMain.handle(
    createIpcHandler(
      ArtifactSchemas.read,
      async ({ projectId, filename }) => {
      },
      'Failed to read artifact'
    )
  );

  /**
   * Delete an artifact file
   */
  ipcMain.handle(
    createIpcHandler(
      ArtifactSchemas.delete,
      async ({ projectId, filename }) => {
      },
      'Failed to delete artifact'
    )
  );

  /**
   * Import a file as an artifact (copy to outputs folder)
   */
  ipcMain.handle(
    createIpcHandler(
      ArtifactSchemas.import,
      async ({ projectId, sourcePath }) => {
      },
      'Failed to import artifact'
    )
  );

  /**
   * Show file dialog to select files for import
   */
}
