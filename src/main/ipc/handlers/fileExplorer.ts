import { ipcMain, dialog, shell, type BrowserWindow } from 'electron';
import { FileExplorerSchemas } from '../validation';
import type { FileExplorerService } from '../../services/files/FileExplorerService';
import type { ProjectWatcherService } from '../../services/files/ProjectWatcherService';
import { unwrapOrThrow } from '../../services/result';
import { toIpcResponse } from '../response';
import { IPC_CHANNELS } from '../channels';
import { openDirectoryInCodeEditor } from '../../services/repo/editorLauncher';

/**
 * File change event types for real-time UI updates
 */
export type FileChangeType = 'created' | 'updated' | 'deleted' | 'renamed';

export interface FileChangeEvent {
  projectId: string;
  type: FileChangeType;
  path: string;
  newPath?: string; // For renames
  isDirectory: boolean;
}

/**
 * Emit file change event to renderer for real-time updates
 */
function emitFileChange(
  mainWindow: BrowserWindow | null,
  event: FileChangeEvent
): void {
  if (mainWindow) {
    mainWindow.webContents.send('file-explorer:file-changed', event);
  }
}

export function registerFileExplorerHandlers(
  fileExplorerService: FileExplorerService,
  projectWatcherService: ProjectWatcherService,
  getMainWindow: () => BrowserWindow | null
): void {
  // List directory contents
  ipcMain.handle(IPC_CHANNELS.fileExplorer.listDirectory, async (_event, params: unknown) => {
    const { projectId, path, recursive, depth } = FileExplorerSchemas.listDirectory.parse(params);
    return unwrapOrThrow(await fileExplorerService.listDirectory(projectId, path ?? '', { recursive, depth }));
  });

  // Create a new folder
  ipcMain.handle(IPC_CHANNELS.fileExplorer.createFolder, async (_event, params: unknown) => {
    const { projectId, path } = FileExplorerSchemas.createFolder.parse(params);
    const result = unwrapOrThrow(await fileExplorerService.createFolder(projectId, path));
    emitFileChange(getMainWindow(), {
      projectId,
      type: 'created',
      path,
      isDirectory: true,
    });
    return result;
  });

  // Create a new file
  ipcMain.handle(IPC_CHANNELS.fileExplorer.createFile, async (_event, params: unknown) => {
    const { projectId, path, content } = FileExplorerSchemas.createFile.parse(params);
    const result = unwrapOrThrow(await fileExplorerService.createFile(projectId, path, content ?? ''));
    emitFileChange(getMainWindow(), {
      projectId,
      type: 'created',
      path,
      isDirectory: false,
    });
    return result;
  });

  // Create a new binary file (images, PDFs, etc.)
  ipcMain.handle(IPC_CHANNELS.fileExplorer.createBinaryFile, async (_event, params: unknown) => {
    const { projectId, path, data } = FileExplorerSchemas.createBinaryFile.parse(params);
    // Convert Uint8Array to Buffer for Node.js fs operations
    const buffer = Buffer.from(data);
    const result = unwrapOrThrow(await fileExplorerService.createBinaryFileAsync(projectId, path, buffer));
    emitFileChange(getMainWindow(), {
      projectId,
      type: 'created',
      path,
      isDirectory: false,
    });
    return result;
  });

  // Copy an external file into the project (avoids renderer reads)
  ipcMain.handle(IPC_CHANNELS.fileExplorer.copyExternalFile, async (_event, params: unknown) => {
    const { projectId, sourcePath, path } = FileExplorerSchemas.copyExternalFile.parse(params);
    const result = unwrapOrThrow(await fileExplorerService.copyExternalFile(projectId, sourcePath, path));
    emitFileChange(getMainWindow(), {
      projectId,
      type: 'created',
      path,
      isDirectory: false,
    });
    return result;
  });

  // Create a symlink to external path
  ipcMain.handle(IPC_CHANNELS.fileExplorer.createSymlink, async (_event, params: unknown) => {
    const { projectId, targetPath, linkPath } = FileExplorerSchemas.createSymlink.parse(params);
    return unwrapOrThrow(await fileExplorerService.createSymlink(projectId, targetPath, linkPath));
  });

  // Delete a file or folder
  ipcMain.handle(IPC_CHANNELS.fileExplorer.delete, async (_event, params: unknown) => {
    const { projectId, path } = FileExplorerSchemas.deleteEntry.parse(params);
    const result = await fileExplorerService.deleteEntry(projectId, path);
    if (result.ok) {
      emitFileChange(getMainWindow(), {
        projectId,
        type: 'deleted',
        path,
        isDirectory: false, // We don't track this for deletes, but it doesn't matter
      });
    }
    return toIpcResponse(result);
  });

  // Rename/move a file or folder
  ipcMain.handle(IPC_CHANNELS.fileExplorer.rename, async (_event, params: unknown) => {
    const { projectId, oldPath, newPath } = FileExplorerSchemas.rename.parse(params);
    const result = unwrapOrThrow(await fileExplorerService.rename(projectId, oldPath, newPath));
    emitFileChange(getMainWindow(), {
      projectId,
      type: 'renamed',
      path: oldPath,
      newPath,
      isDirectory: result.isDirectory,
    });
    return result;
  });

  // Get info about a single file/folder
  ipcMain.handle(IPC_CHANNELS.fileExplorer.getInfo, async (_event, params: unknown) => {
    const { projectId, path } = FileExplorerSchemas.getInfo.parse(params);
    return unwrapOrThrow(await fileExplorerService.getInfo(projectId, path));
  });

  // Read file content
  ipcMain.handle(IPC_CHANNELS.fileExplorer.readFile, async (_event, params: unknown) => {
    const { projectId, path } = FileExplorerSchemas.readFile.parse(params);
    return unwrapOrThrow(await fileExplorerService.readFileAsync(projectId, path));
  });

  // Read binary file content (images, etc.)
  ipcMain.handle(IPC_CHANNELS.fileExplorer.readBinaryFile, async (_event, params: unknown) => {
    const { projectId, path } = FileExplorerSchemas.readBinaryFile.parse(params);
    return unwrapOrThrow(await fileExplorerService.readBinaryFile(projectId, path));
  });

  // Write file content
  ipcMain.handle(IPC_CHANNELS.fileExplorer.writeFile, async (_event, params: unknown) => {
    const { projectId, path, content } = FileExplorerSchemas.writeFile.parse(params);
    const result = await fileExplorerService.writeFile(projectId, path, content);
    if (result.ok) {
      emitFileChange(getMainWindow(), {
        projectId,
        type: 'updated',
        path,
        isDirectory: false,
      });
    }
    return toIpcResponse(result);
  });

  // Get symlink information
  ipcMain.handle(IPC_CHANNELS.fileExplorer.getSymlinkInfo, async (_event, params: unknown) => {
    const { projectId, path } = FileExplorerSchemas.getSymlinkInfo.parse(params);
    return unwrapOrThrow(await fileExplorerService.getSymlinkInfo(projectId, path));
  });

  // Show a project file/folder in Finder/Explorer
  ipcMain.handle(IPC_CHANNELS.fileExplorer.showItemInFolder, async (_event, params: unknown) => {
    const { projectId, path } = FileExplorerSchemas.showItemInFolder.parse(params);
    const fullPath = unwrapOrThrow(await fileExplorerService.getFullPath(projectId, path));
    shell.showItemInFolder(fullPath);
    return { success: true };
  });

  // Open a project file/folder in the user's code editor
  ipcMain.handle(IPC_CHANNELS.fileExplorer.openInEditor, async (_event, params: unknown) => {
    const { projectId, path } = FileExplorerSchemas.openInEditor.parse(params);
    const fullPath = unwrapOrThrow(await fileExplorerService.getFullPath(projectId, path));
    try {
      await openDirectoryInCodeEditor(fullPath);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Show folder selection dialog for linking external folders
  ipcMain.handle(IPC_CHANNELS.fileExplorer.selectFolderDialog, async (_event, params: unknown) => {
    const { title } = FileExplorerSchemas.selectFolderDialog.parse(params);
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: title ?? 'Select Folder to Link',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // Watch project folder for external file changes
  ipcMain.handle(IPC_CHANNELS.fileExplorer.watchProject, async (_event, params: unknown) => {
    const { projectId } = FileExplorerSchemas.watchProject.parse(params);
    return projectWatcherService.watchProject(projectId);
  });

  // Stop watching project folder
  ipcMain.handle(IPC_CHANNELS.fileExplorer.unwatchProject, async (_event, params: unknown) => {
    FileExplorerSchemas.unwatchProject.parse(params);
    await projectWatcherService.unwatchProject();
    return { success: true };
  });

}
