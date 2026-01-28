import { FileExplorerSchemas } from '../validation';
import type { FileExplorerService } from '../../services/files/FileExplorerService';
import type { ProjectWatcherService } from '../../services/files/ProjectWatcherService';
import { unwrapOrThrow } from '../../services/result';
import { toIpcResponse } from '../response';

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
    const { projectId, path, recursive, depth } = FileExplorerSchemas.listDirectory.parse(params);
  });

  // Create a new folder
    const { projectId, path } = FileExplorerSchemas.createFolder.parse(params);
    emitFileChange(getMainWindow(), {
      projectId,
      type: 'created',
      path,
      isDirectory: true,
    });
    return result;
  });

  // Create a new file
    const { projectId, path, content } = FileExplorerSchemas.createFile.parse(params);
    emitFileChange(getMainWindow(), {
      projectId,
      type: 'created',
      path,
      isDirectory: false,
    });
    return result;
  });

  // Create a new binary file (images, PDFs, etc.)
    const { projectId, path, data } = FileExplorerSchemas.createBinaryFile.parse(params);
    // Convert Uint8Array to Buffer for Node.js fs operations
    const buffer = Buffer.from(data);
    emitFileChange(getMainWindow(), {
      projectId,
      type: 'created',
      path,
      isDirectory: false,
    });
    return result;
  });

  // Create a symlink to external path
    const { projectId, targetPath, linkPath } = FileExplorerSchemas.createSymlink.parse(params);
  });

  // Delete a file or folder
    const { projectId, path } = FileExplorerSchemas.deleteEntry.parse(params);
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
    const { projectId, oldPath, newPath } = FileExplorerSchemas.rename.parse(params);
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
    const { projectId, path } = FileExplorerSchemas.getInfo.parse(params);
  });

  // Read file content
    const { projectId, path } = FileExplorerSchemas.readFile.parse(params);
  });

  // Read binary file content (images, etc.)
    const { projectId, path } = FileExplorerSchemas.readBinaryFile.parse(params);
  });

  // Write file content
    const { projectId, path, content } = FileExplorerSchemas.writeFile.parse(params);
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
    const { projectId, path } = FileExplorerSchemas.getSymlinkInfo.parse(params);
  });

  // Show folder selection dialog for linking external folders
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
    const { projectId } = FileExplorerSchemas.watchProject.parse(params);
    return projectWatcherService.watchProject(projectId);
  });

  // Stop watching project folder
    FileExplorerSchemas.unwatchProject.parse(params);
    return { success: true };
  });

}
