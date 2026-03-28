import { ipcMain, dialog, type BrowserWindow } from 'electron';
import type { ContextFileService } from '../../services/core/ContextFileService';
import { FileSchemas, createIpcHandler, createSimpleIpcHandler } from '../validation';
import { IPC_CHANNELS } from '../channels';

export function registerFileHandlers(
  getMainWindow: () => BrowserWindow | null,
  contextFileService: ContextFileService,
): void {
  // Project context file operations (AGENTS.md / CLAUDE.md)
  ipcMain.handle(IPC_CHANNELS.claudeMd.read, createIpcHandler(
    FileSchemas.read,
    async ({ projectId }) => {
      const result = await contextFileService.readClaudeMd(projectId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    'Failed to read project context',
  ));

  ipcMain.handle(IPC_CHANNELS.claudeMd.write, createIpcHandler(
    FileSchemas.write,
    async ({ projectId, content }) => {
      const result = await contextFileService.writeClaudeMd(projectId, content);
      if (!result.ok) throw new Error(result.error);
    },
    'Failed to write project context',
  ));

  // ==========================================================================
  // Context Files (all .md files in project root)
  // ==========================================================================

  // List all context files in project root
  ipcMain.handle(IPC_CHANNELS.context.list, createIpcHandler(
    FileSchemas.listContext,
    async ({ projectId }) => {
      const result = await contextFileService.listContextFiles(projectId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    'Failed to list context files',
  ));

  // Read a context file by relative path
  ipcMain.handle(IPC_CHANNELS.context.read, createIpcHandler(
    FileSchemas.readContext,
    async ({ projectId, path }) => {
      const result = await contextFileService.readContextFile(projectId, path);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    'Failed to read context file',
  ));

  // Write a context file by relative path
  ipcMain.handle(IPC_CHANNELS.context.write, createIpcHandler(
    FileSchemas.writeContext,
    async ({ projectId, path, content }) => {
      const result = await contextFileService.writeContextFile(projectId, path, content);
      if (!result.ok) throw new Error(result.error);
    },
    'Failed to write context file',
  ));

  // Delete a context file by relative path
  ipcMain.handle(IPC_CHANNELS.context.delete, createIpcHandler(
    FileSchemas.deleteContext,
    async ({ projectId, path }) => {
      const result = await contextFileService.deleteContextFile(projectId, path);
      if (!result.ok) throw new Error(result.error);
    },
    'Failed to delete context file',
  ));

  // Import a file as context (copy to project root)
  ipcMain.handle(IPC_CHANNELS.context.import, createIpcHandler(
    FileSchemas.importContext,
    async ({ projectId, sourcePath }) => {
      const result = await contextFileService.importContextFile(projectId, sourcePath);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    'Failed to import context file',
  ));

  // Show file dialog to select files for import
  ipcMain.handle(IPC_CHANNELS.context.selectDialog, createSimpleIpcHandler(async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return { paths: [] };

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      title: 'Select Context Files',
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'Text', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    return { paths: result.canceled ? [] : result.filePaths };
  }, 'Failed to open context file selection dialog'));
}
