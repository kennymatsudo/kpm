/**
 */

import { ipcMain, dialog, type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../channels';

export function registerArtifactHandlers(
  getMainWindow: () => BrowserWindow | null,
): void {
  /**
   * List artifacts in the outputs folder
   */
  ipcMain.handle(
    IPC_CHANNELS.artifact.list,
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
    IPC_CHANNELS.artifact.read,
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
    IPC_CHANNELS.artifact.delete,
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
    IPC_CHANNELS.artifact.import,
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
