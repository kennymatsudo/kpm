/**
 * IPC Handlers for Custom Prompts
 *
 * Handles CRUD operations for custom prompts and execution.
 */

import type { BrowserWindow } from 'electron';
import { createRegistryIpcHandlers } from '../validation/utils';
import { customPromptEndpoints, type CustomPromptEndpointName } from '../../../shared/ipc/customPromptEndpoints';
import type { EndpointPayload } from '../../../shared/ipc/endpoints';
import type { CustomPromptService } from '../../services/core/CustomPromptService';

type CustomPromptHandler<K extends CustomPromptEndpointName> = (
  params: EndpointPayload<(typeof customPromptEndpoints)[K]>
) => unknown;

/**
 * One handler per `customPromptEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type CustomPromptHandlers = { [K in CustomPromptEndpointName]: CustomPromptHandler<K> };

function buildCustomPromptHandlers(
  getMainWindow: () => BrowserWindow | null,
  customPromptService: CustomPromptService,
): CustomPromptHandlers {
  return {
    list: async () => {
      const result = customPromptService.list();
      if (!result.ok) throw new Error(result.error);
      return { prompts: result.data };
    },

    get: async ({ promptId }) => {
      const result = customPromptService.get(promptId);
      if (!result.ok) throw new Error(result.error);
      return { prompt: result.data };
    },

    create: async ({ name, description, promptContent, icon, keywords, targetType, runMode }) => {
      const result = customPromptService.create({
        name,
        description,
        promptContent,
        icon,
        keywords,
        targetType,
        runMode,
      });
      if (!result.ok) throw new Error(result.error);
      return { prompt: result.data };
    },

    update: async ({ promptId, name, description, promptContent, icon, keywords, targetType, runMode }) => {
      const result = customPromptService.update(promptId, {
        name,
        description,
        promptContent,
        icon,
        keywords,
        targetType,
        runMode,
      });
      if (!result.ok) throw new Error(result.error);
    },

    delete: async ({ promptId }) => {
      const result = customPromptService.delete(promptId);
      if (!result.ok) throw new Error(result.error);
    },

    execute: async ({ promptId, projectId }) => {
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        throw new Error('Main window not available');
      }

      const promptResult = customPromptService.get(promptId);
      if (!promptResult.ok) {
        throw new Error(promptResult.error);
      }

      const taskId = `custom-prompt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const result = customPromptService.startExecution(
        promptId,
        projectId,
        {
          onProgress: (message: string) => {
            mainWindow.webContents.send('custom-prompt:progress', {
              taskId,
              message,
            });
          },
          onComplete: (filePath: string) => {
            mainWindow.webContents.send('custom-prompt:complete', {
              taskId,
              filePath,
              promptName: promptResult.data.name,
            });
          },
          onError: (error: string) => {
            mainWindow.webContents.send('custom-prompt:error', {
              taskId,
              error,
            });
          },
        }
      );

      if (!result.ok) {
        throw new Error(result.error);
      }

      return { taskId };
    },

    ensureBuiltins: async () => {
      const result = customPromptService.ensureBuiltins();
      if (!result.ok) {
        throw new Error(result.error);
      }
    },
  };
}

/**
 * Register all custom prompt IPC handlers
 */
export function registerCustomPromptHandlers(
  getMainWindow: () => BrowserWindow | null,
  customPromptService: CustomPromptService,
): void {
  createRegistryIpcHandlers(
    customPromptEndpoints,
    buildCustomPromptHandlers(getMainWindow, customPromptService),
    'Custom prompt operation failed'
  );
}
