/**
 * IPC Handlers for project outputs/ folder management.
 *
 * Lists, reads, deletes, and imports markdown files from the project's
 * outputs/ directory (used by Custom Prompts and other generators).
 */

import { ipcMain, dialog, type BrowserWindow } from 'electron';
import { artifactEndpoints, type ArtifactEndpointName } from '../../../shared/ipc/artifactEndpoints';
import type { EndpointPayload } from '../../../shared/ipc/endpoints';
import type { ArtifactService } from '../../services/core/ArtifactService';

type ArtifactHandler<K extends ArtifactEndpointName> = (
  params: EndpointPayload<(typeof artifactEndpoints)[K]>,
  event: Electron.IpcMainInvokeEvent
) => Promise<unknown>;

/**
 * One handler per `artifactEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type ArtifactHandlers = { [K in ArtifactEndpointName]: ArtifactHandler<K> };

function buildArtifactHandlers(
  getMainWindow: () => BrowserWindow | null,
  artifactService: ArtifactService
): ArtifactHandlers {
  return {
    /**
     * List artifacts in the outputs folder
     */
    list: async ({ projectId }) => {
      const result = artifactService.list(projectId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },

    /**
     * Read an artifact file
     */
    read: async ({ projectId, filename }) => {
      const result = artifactService.read(projectId, filename);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },

    /**
     * Delete an artifact file
     */
    delete: async ({ projectId, filename }) => {
      const result = artifactService.delete(projectId, filename);
      if (!result.ok) throw new Error(result.error);
    },

    /**
     * Import a file as an artifact (copy to outputs folder)
     */
    import: async ({ projectId, sourcePath }) => {
      const result = artifactService.import(projectId, sourcePath);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },

    /**
     * Show file dialog to select files for import
     */
    selectDialog: async () => {
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
    },
  };
}

export function registerArtifactHandlers(
  getMainWindow: () => BrowserWindow | null,
  artifactService: ArtifactService
): void {
  const handlers = buildArtifactHandlers(getMainWindow, artifactService);

  for (const [name, { channel, params }] of Object.entries(artifactEndpoints) as [
    ArtifactEndpointName,
    (typeof artifactEndpoints)[ArtifactEndpointName],
  ][]) {
    // Each handler's parameter type was checked once against its own
    // registry entry in `buildArtifactHandlers`; iterating erases that
    // per-key correlation into a union, hence the cast here.
    const handler = handlers[name] as (params: unknown, event: Electron.IpcMainInvokeEvent) => unknown;
    ipcMain.handle(channel, async (event, rawParams: unknown) => {
      const parsedParams = params ? params.parse(rawParams) : undefined;
      return handler(parsedParams, event);
    });
  }
}
