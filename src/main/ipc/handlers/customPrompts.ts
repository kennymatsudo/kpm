/**
 * IPC Handlers for Custom Prompts
 *
 * Handles CRUD operations for custom prompts and execution.
 */

import { ipcMain, type BrowserWindow } from 'electron';
import { createIpcHandler, createSimpleIpcHandler, CustomPromptSchemas } from '../validation';
import { IPC_CHANNELS } from '../channels';
import type { CustomPromptService } from '../../services/core/CustomPromptService';

/**
 * Register all custom prompt IPC handlers
 */
export function registerCustomPromptHandlers(
  getMainWindow: () => BrowserWindow | null,
  customPromptService: CustomPromptService,
): void {
  /**
   * List all custom prompts
   */
  ipcMain.handle(
    IPC_CHANNELS.customPrompts.list,
    createIpcHandler(
      CustomPromptSchemas.list,
      async () => {
        const result = customPromptService.list();
        if (!result.ok) throw new Error(result.error);
        return { prompts: result.data };
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
        const result = customPromptService.get(promptId);
        if (!result.ok) throw new Error(result.error);
        return { prompt: result.data };
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
      async ({ name, description, promptContent, icon, keywords, targetType, runMode }) => {
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
      async ({ promptId, name, description, promptContent, icon, keywords, targetType, runMode }) => {
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
        const result = customPromptService.delete(promptId);
        if (!result.ok) throw new Error(result.error);
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
      'Failed to execute custom prompt'
    )
  );

  /**
   * Ensure built-in prompts exist (called at app startup)
   */
  ipcMain.handle(IPC_CHANNELS.customPrompts.ensureBuiltins, createSimpleIpcHandler(() => {
    const result = customPromptService.ensureBuiltins();
    if (!result.ok) {
      throw new Error(result.error);
    }
  }, 'Failed to ensure built-in prompts'));
}
