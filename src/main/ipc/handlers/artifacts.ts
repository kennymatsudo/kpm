/**
 */

import { ipcMain, dialog, type BrowserWindow } from 'electron';
import { createIpcHandler, createSimpleIpcHandler, ArtifactSchemas } from '../validation';
import type { ArtifactService } from '../../services/core/ArtifactService';
import { IPC_CHANNELS } from '../channels';

export function registerArtifactHandlers(
  getMainWindow: () => BrowserWindow | null,
  artifactService: ArtifactService,
): void {
  /**
   * List artifacts in the outputs folder
   */
  ipcMain.handle(
    IPC_CHANNELS.artifact.list,
    createIpcHandler(
      ArtifactSchemas.list,
      async ({ projectId }) => {
        const result = artifactService.list(projectId);
        if (!result.ok) throw new Error(result.error);
        return result.data;
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
        const result = artifactService.read(projectId, filename);
        if (!result.ok) throw new Error(result.error);
        return result.data;
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
        const result = artifactService.delete(projectId, filename);
        if (!result.ok) throw new Error(result.error);
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
        const result = artifactService.import(projectId, sourcePath);
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      'Failed to import artifact'
    )
  );

  /**
   * Show file dialog to select files for import
   */
  ipcMain.handle(
    IPC_CHANNELS.artifact.selectDialog,
    createSimpleIpcHandler(async () => {
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        return { paths: [] };
      }

      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        title: 'Select Output Files',
        filters: [
          { name: 'Markdown', extensions: ['md', 'markdown'] },
          { name: 'Text', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      return { paths: result.canceled ? [] : result.filePaths };
    }, 'Failed to open artifact selection dialog'),
  );
}
