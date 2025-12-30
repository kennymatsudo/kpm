import { FileExplorerSchemas } from '../validation';
import type { FileExplorerService } from '../../services/files/FileExplorerService';
import { unwrapOrThrow } from '../../services/result';
import { toIpcResponse } from '../response';

export function registerFileExplorerHandlers(
  fileExplorerService: FileExplorerService,
  getMainWindow: () => BrowserWindow | null
): void {
  // List directory contents
    const { projectId, path, recursive, depth } = FileExplorerSchemas.listDirectory.parse(params);
  });

  // Create a new folder
    const { projectId, path } = FileExplorerSchemas.createFolder.parse(params);
  });

  // Create a new file
    const { projectId, path, content } = FileExplorerSchemas.createFile.parse(params);
  });

  // Create a symlink to external path
    const { projectId, targetPath, linkPath } = FileExplorerSchemas.createSymlink.parse(params);
  });

  // Delete a file or folder
    const { projectId, path } = FileExplorerSchemas.deleteEntry.parse(params);
  });

  // Rename/move a file or folder
    const { projectId, oldPath, newPath } = FileExplorerSchemas.rename.parse(params);
  });

  // Get info about a single file/folder
    const { projectId, path } = FileExplorerSchemas.getInfo.parse(params);
  });

  // Read file content
    const { projectId, path } = FileExplorerSchemas.readFile.parse(params);
  });

  // Write file content
    const { projectId, path, content } = FileExplorerSchemas.writeFile.parse(params);
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

}
