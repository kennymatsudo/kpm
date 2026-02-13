import { RepoFileSchemas } from '../validation';
import type { RepoFileService } from '../../services/files/RepoFileService';
import { unwrapOrThrow } from '../../services/result';
import { toIpcResponse } from '../response';
import { IPC_CHANNELS } from '../channels';

/**
 * Register IPC handlers for repo file operations.
 * These handle file operations within connected repositories for the workspace view.
 */
export function registerRepoFileHandlers(repoFileService: RepoFileService): void {
  // List directory contents within a repo
  ipcMain.handle(IPC_CHANNELS.repoFiles.listDirectory, async (_event, params: unknown) => {
    const { repoId, path, recursive, depth } = RepoFileSchemas.listDirectory.parse(params);
  });

  // Read file content from a repo
  ipcMain.handle(IPC_CHANNELS.repoFiles.readFile, async (_event, params: unknown) => {
    const { repoId, path } = RepoFileSchemas.readFile.parse(params);
  });

  // Write file content to a repo (markdown/text files only)
  ipcMain.handle(IPC_CHANNELS.repoFiles.writeFile, async (_event, params: unknown) => {
    const { repoId, path, content } = RepoFileSchemas.writeFile.parse(params);
  });

  // Get info about a single file/folder
  ipcMain.handle(IPC_CHANNELS.repoFiles.getInfo, async (_event, params: unknown) => {
    const { repoId, path } = RepoFileSchemas.getInfo.parse(params);
  });
}
