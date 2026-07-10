import { app, dialog, type BrowserWindow } from 'electron';
import { contextEndpoints, type ContextEndpointName } from '../../../shared/ipc/contextEndpoints';
import type { HandlerFor } from '../../../shared/ipc/endpoints';
import { createRegistryIpcHandlers } from '../validation/utils';
import type { ContextFileService } from '../../services/core/ContextFileService';

/**
 * One handler per `contextEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type ContextHandlers = { [K in ContextEndpointName]: HandlerFor<typeof contextEndpoints, K> };

function buildContextHandlers(
  getMainWindow: () => BrowserWindow | null,
  contextFileService: ContextFileService
): ContextHandlers {
  return {
    // Project context file operations (AGENTS.md / CLAUDE.md)
    'contextFile.read': async ({ projectId }) => {
      const result = await contextFileService.readProjectContextFile(projectId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },

    'contextFile.write': async ({ projectId, content }) => {
      const result = await contextFileService.writeProjectContextFile(projectId, content);
      if (!result.ok) throw new Error(result.error);
    },

    // ==========================================================================
    // Context Files (all .md files in project root)
    // ==========================================================================

    // List all context files in project root
    'context.list': async ({ projectId }) => {
      const result = await contextFileService.listContextFiles(projectId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },

    // Read a context file by relative path
    'context.read': async ({ projectId, path }) => {
      const result = await contextFileService.readContextFile(projectId, path);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },

    // Write a context file by relative path
    'context.write': async ({ projectId, path, content }) => {
      const result = await contextFileService.writeContextFile(projectId, path, content);
      if (!result.ok) throw new Error(result.error);
    },

    // Delete a context file by relative path
    'context.delete': async ({ projectId, path }) => {
      const result = await contextFileService.deleteContextFile(projectId, path);
      if (!result.ok) throw new Error(result.error);
    },

    // Import a file as context (copy to project root)
    'context.import': async ({ projectId, sourcePath }) => {
      const result = await contextFileService.importContextFile(projectId, sourcePath);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },

    // Show file dialog to select files for import
    'context.selectDialog': async () => {
      const mainWindow = getMainWindow();
      if (!mainWindow) return { paths: [] };

      const result = await dialog.showOpenDialog(mainWindow, {
        defaultPath: app.getPath('home'),
        properties: ['openFile', 'multiSelections'],
        title: 'Select Context Files',
        filters: [
          { name: 'Markdown', extensions: ['md', 'markdown'] },
          { name: 'Text', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      return { paths: result.canceled ? [] : result.filePaths };
    },
  };
}

export function registerFileHandlers(
  getMainWindow: () => BrowserWindow | null,
  contextFileService: ContextFileService,
): void {
  createRegistryIpcHandlers(
    contextEndpoints,
    buildContextHandlers(getMainWindow, contextFileService),
    'Context operation failed',
  );
}
