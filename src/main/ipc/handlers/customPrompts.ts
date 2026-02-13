/**
 * IPC Handlers for Custom Prompts
 *
 * Handles CRUD operations for custom prompts and execution.
 */

import { ipcMain, type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../channels';

/**
 * Register all custom prompt IPC handlers
 */
  /**
   * List all custom prompts
   */
  ipcMain.handle(
    IPC_CHANNELS.customPrompts.list,
    createIpcHandler(
      CustomPromptSchemas.list,
      async () => {
      },
      'Failed to list custom prompts'
    )
  );

  /**
   * Get a single custom prompt by ID
   */
  ipcMain.handle(
    IPC_CHANNELS.customPrompts.get,
    createIpcHandler(
      CustomPromptSchemas.get,
      async ({ promptId }) => {
      },
      'Failed to get custom prompt'
    )
  );

  /**
   * Create a new custom prompt
   */
  ipcMain.handle(
    IPC_CHANNELS.customPrompts.create,
    createIpcHandler(
      CustomPromptSchemas.create,
          name,
        });
      },
      'Failed to create custom prompt'
    )
  );

  /**
   * Update an existing custom prompt
   */
  ipcMain.handle(
    IPC_CHANNELS.customPrompts.update,
    createIpcHandler(
      CustomPromptSchemas.update,
      },
      'Failed to update custom prompt'
    )
  );

  /**
   * Delete a custom prompt (not allowed for built-in prompts)
   */
  ipcMain.handle(
    IPC_CHANNELS.customPrompts.delete,
    createIpcHandler(
      CustomPromptSchemas.delete,
      async ({ promptId }) => {
      },
      'Failed to delete custom prompt'
    )
  );

  /**
   * Execute a custom prompt
   */
  ipcMain.handle(
    IPC_CHANNELS.customPrompts.execute,
    createIpcHandler(
      CustomPromptSchemas.execute,
      async ({ promptId, projectId }) => {
        const mainWindow = getMainWindow();
        if (!mainWindow) {
          throw new Error('Main window not available');
        }

        }

        const taskId = `custom-prompt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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

        return { taskId };
      },
      'Failed to execute custom prompt'
    )
  );

  /**
   * Ensure built-in prompts exist (called at app startup)
   */
}
