import { ipcMain, dialog, shell, type BrowserWindow } from 'electron';
import { fileExplorerEndpoints, type FileExplorerEndpointName } from '../../../shared/ipc/fileExplorerEndpoints';
import type { HandlerFor } from '../../../shared/ipc/endpoints';
import type { FileExplorerService } from '../../services/files/FileExplorerService';
import type { ProjectWatcherService } from '../../services/files/ProjectWatcherService';
import { unwrapOrThrow } from '../../services/result';
import { toIpcResponse } from '../response';
import { openDirectoryInCodeEditor } from '../../services/repo/editorLauncher';
import { emitAppEvent } from '../../../shared/ipc/appEvents';
import { fileExplorerEvents, type FileExplorerFileChangedEventData } from '../../../shared/ipc/fileExplorerEvents';

/** File change event types for real-time UI updates */
export type FileChangeType = FileExplorerFileChangedEventData['type'];

export type FileChangeEvent = FileExplorerFileChangedEventData;

/**
 * Emit file change event to renderer for real-time updates
 */
function emitFileChange(
  mainWindow: BrowserWindow | null,
  event: FileChangeEvent
): void {
  emitAppEvent(mainWindow?.webContents, fileExplorerEvents.fileChanged, event);
}

/**
 * One handler per `fileExplorerEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type FileExplorerHandlers = {
  [K in FileExplorerEndpointName]: HandlerFor<typeof fileExplorerEndpoints, K>;
};

function buildFileExplorerHandlers(
  fileExplorerService: FileExplorerService,
  projectWatcherService: ProjectWatcherService,
  getMainWindow: () => BrowserWindow | null
): FileExplorerHandlers {
  return {
    listDirectory: async ({ projectId, path, recursive, depth }) =>
      unwrapOrThrow(await fileExplorerService.listDirectory(projectId, path ?? '', { recursive, depth })),

    createFolder: async ({ projectId, path }) => {
      const result = unwrapOrThrow(await fileExplorerService.createFolder(projectId, path));
      emitFileChange(getMainWindow(), {
        projectId,
        type: 'created',
        path,
        isDirectory: true,
      });
      return result;
    },

    createFile: async ({ projectId, path, content }) => {
      const result = unwrapOrThrow(await fileExplorerService.createFile(projectId, path, content ?? ''));
      emitFileChange(getMainWindow(), {
        projectId,
        type: 'created',
        path,
        isDirectory: false,
      });
      return result;
    },

    createBinaryFile: async ({ projectId, path, data }) => {
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
    },

    copyExternalFile: async ({ projectId, sourcePath, path }) => {
      const result = unwrapOrThrow(await fileExplorerService.copyExternalFile(projectId, sourcePath, path));
      emitFileChange(getMainWindow(), {
        projectId,
        type: 'created',
        path,
        isDirectory: false,
      });
      return result;
    },

    createSymlink: async ({ projectId, targetPath, linkPath }) =>
      unwrapOrThrow(await fileExplorerService.createSymlink(projectId, targetPath, linkPath)),

    delete: async ({ projectId, path }) => {
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
    },

    rename: async ({ projectId, oldPath, newPath }) => {
      const result = unwrapOrThrow(await fileExplorerService.rename(projectId, oldPath, newPath));
      emitFileChange(getMainWindow(), {
        projectId,
        type: 'renamed',
        path: oldPath,
        newPath,
        isDirectory: result.isDirectory,
      });
      return result;
    },

    getInfo: async ({ projectId, path }) => unwrapOrThrow(await fileExplorerService.getInfo(projectId, path)),

    readFile: async ({ projectId, path }) => unwrapOrThrow(await fileExplorerService.readFileAsync(projectId, path)),

    readBinaryFile: async ({ projectId, path }) =>
      unwrapOrThrow(await fileExplorerService.readBinaryFile(projectId, path)),

    writeFile: async ({ projectId, path, content }) => {
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
    },

    getSymlinkInfo: async ({ projectId, path }) =>
      unwrapOrThrow(await fileExplorerService.getSymlinkInfo(projectId, path)),

    showItemInFolder: async ({ projectId, path }) => {
      const fullPath = unwrapOrThrow(await fileExplorerService.getFullPath(projectId, path));
      shell.showItemInFolder(fullPath);
      return { success: true };
    },

    openInEditor: async ({ projectId, path }) => {
      const fullPath = unwrapOrThrow(await fileExplorerService.getFullPath(projectId, path));
      try {
        await openDirectoryInCodeEditor(fullPath);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    selectFolderDialog: async ({ title }) => {
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
    },

    watchProject: async ({ projectId }) => projectWatcherService.watchProject(projectId),

    unwatchProject: async () => {
      await projectWatcherService.unwatchProject();
      return { success: true };
    },
  };
}

export function registerFileExplorerHandlers(
  fileExplorerService: FileExplorerService,
  projectWatcherService: ProjectWatcherService,
  getMainWindow: () => BrowserWindow | null
): void {
  const handlers = buildFileExplorerHandlers(fileExplorerService, projectWatcherService, getMainWindow);

  for (const [name, { channel, params }] of Object.entries(fileExplorerEndpoints) as [
    FileExplorerEndpointName,
    (typeof fileExplorerEndpoints)[FileExplorerEndpointName],
  ][]) {
    // Each handler's parameter type was checked once against its own
    // registry entry in `buildFileExplorerHandlers`; iterating erases that
    // per-key correlation into a union, hence the cast here.
    const handler = handlers[name] as (params: unknown, event: Electron.IpcMainInvokeEvent) => unknown;
    ipcMain.handle(channel, async (event, rawParams: unknown) => {
      const parsedParams = params ? params.parse(rawParams) : undefined;
      return handler(parsedParams, event);
    });
  }
}
