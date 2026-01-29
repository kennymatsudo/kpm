import fs from 'fs';
import path from 'path';

const MAX_BINARY_BYTES = 50 * 1024 * 1024; // 50MB

export interface FileExplorerServiceDeps {
  getProjectFolder: (projectId: string) => string | null;
}

export function createFileExplorerService(deps: FileExplorerServiceDeps) {
    /**
     * List directory contents with optional recursion.
     */
      projectId: string,
      relativePath = '',
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }


      try {
        return success(nodes);
      } catch (error) {
        return failure(`Failed to list directory: ${error}`);
      }
    },

    /**
     * Create a new folder.
     */
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }


      try {
          return failure('Path already exists');
        }


        return success({
          name: path.basename(relativePath),
          path: relativePath,
          isDirectory: true,
          isSymlink: false,
          modifiedAt: stats.mtime.toISOString(),
          size: 0,
          children: [],
        });
      } catch (error) {
        return failure(`Failed to create folder: ${error}`);
      }
    },

    /**
     * Create a new file with optional content.
     */
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }


      try {
          return failure('Path already exists');
        }

        // Ensure parent directory exists

      } catch (error) {
        return failure(`Failed to create file: ${error}`);
      }
    },

    /**
     * Create a symbolic link to an external path.
     * This is Mac-only for now.
     */
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }


      }

      try {
        }

          return failure('Link path already exists');
        }


        return success({
          isDirectory: targetStats.isDirectory(),
          symlinkTarget: targetPath,
          isSymlinkBroken: false,
        });
      } catch (error) {
        return failure(`Failed to create symlink: ${error}`);
      }
    },

    /**
     * Delete a file or folder (recursively for folders).
     */
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }


        return failure('Cannot delete project root');
      }

      const baseName = path.basename(relativePath);
      }

      try {
        }

        if (stats.isDirectory() && !stats.isSymbolicLink()) {
          // Recursively delete directory
        } else {
          // Delete file or symlink
        }

        return success(undefined);
      } catch (error) {
        return failure(`Failed to delete: ${error}`);
      }
    },

    /**
     * Rename or move a file/folder.
     */
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }


      try {
        }

        }

        // Ensure parent directory of destination exists

      } catch (error) {
        return failure(`Failed to rename: ${error}`);
      }
    },

    /**
     * Get information about a single file/folder.
     */
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }


      try {
          return failure('Path does not exist');
        }

      } catch (error) {
        return failure(`Failed to get info: ${error}`);
      }
    },

    /**
     */
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }


      try {
        }

        if (stats.isDirectory()) {
          return failure('Cannot read directory as file');
        }

        return success(content);
      } catch (error) {
        return failure(`Failed to read file: ${error}`);
      }
    },

    /**
     * Read binary file content (images, PDFs, etc.).
     * Returns a Buffer which serializes to Uint8Array over IPC.
     */
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }


      try {
        }

        if (stats.isDirectory()) {
          return failure('Cannot read directory as file');
        }

        return success(content);
      } catch (error) {
        return failure(`Failed to read binary file: ${error}`);
      }
    },

    /**
     * Write file content.
     */
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }


      try {
        // Ensure parent directory exists

        return success(undefined);
      } catch (error) {
        return failure(`Failed to write file: ${error}`);
      }
    },

    /**
     * Create a new binary file (images, PDFs, etc.) asynchronously.
     * Avoids blocking the main process for large writes.
     */
    async createBinaryFileAsync(
      projectId: string,
      relativePath: string,
      data: Buffer
    ): Promise<ServiceResult<FileNode>> {
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }


      try {
        if (data.byteLength > MAX_BINARY_BYTES) {
          const sizeMB = (data.byteLength / (1024 * 1024)).toFixed(1);
          return failure(`File too large (${sizeMB}MB). Max ${MAX_BINARY_BYTES / (1024 * 1024)}MB.`);
        }

        if (exists) {
          return failure('Path already exists');
        }

        await ensureParentDirectory(fullPath);
        await fs.promises.writeFile(fullPath, data);

        const stats = await fs.promises.stat(fullPath);
        return success({
          name: path.basename(relativePath),
          path: relativePath,
          isDirectory: false,
          isSymlink: false,
          modifiedAt: stats.mtime.toISOString(),
          size: stats.size,
        });
      } catch (error) {
        return failure(`Failed to create binary file: ${error}`);
      }
    },

    /**
     * Copy an external file into the project without loading it into the renderer.
     */
    async copyExternalFile(
      projectId: string,
      sourcePath: string,
      relativePath: string
    ): Promise<ServiceResult<FileNode>> {
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }

      }

      try {
        const sourceStats = await fs.promises.stat(sourcePath);
        if (!sourceStats.isFile()) {
          return failure('Source path is not a file');
        }

        if (sourceStats.size > MAX_BINARY_BYTES) {
          const sizeMB = (sourceStats.size / (1024 * 1024)).toFixed(1);
          return failure(`File too large (${sizeMB}MB). Max ${MAX_BINARY_BYTES / (1024 * 1024)}MB.`);
        }

        if (path.resolve(sourcePath) === path.resolve(fullPath)) {
          return failure('Source and destination paths are the same');
        }

        if (destExists) {
          return failure('Path already exists');
        }

        await ensureParentDirectory(fullPath);
        await fs.promises.copyFile(sourcePath, fullPath, fs.constants.COPYFILE_EXCL);

        const stats = await fs.promises.stat(fullPath);
        return success({
          name: path.basename(relativePath),
          path: relativePath,
          isDirectory: false,
          isSymlink: false,
          modifiedAt: stats.mtime.toISOString(),
          size: stats.size,
        });
      } catch (error) {
        return failure(`Failed to copy file: ${error}`);
      }
    },

    /**
     * Check if a path is a symlink and get its target.
     */
      projectId: string,
      relativePath: string
      const projectFolder = deps.getProjectFolder(projectId);
      if (!projectFolder) {
        return failure('Project not found');
      }


      try {
        }

        if (!stats.isSymbolicLink()) {
          return success({ isSymlink: false });
        }

        let isBroken = false;
        try {
        } catch {
          isBroken = true;
        }

        return success({ isSymlink: true, target, isBroken });
      } catch (error) {
        return failure(`Failed to get symlink info: ${error}`);
      }
    },
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type FileExplorerService = ReturnType<typeof createFileExplorerService>;
