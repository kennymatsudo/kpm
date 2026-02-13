/**
 * Prompt Override IPC Handlers
 *
 * CRUD operations for prompt overrides.
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../channels';
import { createIpcHandler, PromptOverrideSchemas } from '../validation';
import type { PromptOverrideService } from '../../services/core/PromptOverrideService';

export function registerPromptOverrideHandlers(promptOverrideService: PromptOverrideService): void {
  /**
   * List all prompts with override status, optionally filtered by category.
   */
  ipcMain.handle(
    IPC_CHANNELS.promptOverrides.list,
    createIpcHandler(
      PromptOverrideSchemas.list,
      async ({ category }) => {
        const prompts = category
          ? promptOverrideService.listByCategory(category)
          : promptOverrideService.listAll();
        return { prompts };
      },
      'Failed to list prompts'
    )
  );

  /**
   * Get a prompt's full definition with current content.
   */
  ipcMain.handle(
    IPC_CHANNELS.promptOverrides.get,
    createIpcHandler(
      PromptOverrideSchemas.get,
      async ({ key }) => {
        const definition = promptOverrideService.getDefinition(key);
        if (!definition) {
          throw new Error(`Unknown prompt key: ${key}`);
        }
        return { prompt: definition };
      },
      'Failed to get prompt'
    )
  );

  /**
   * Set a prompt override.
   */
  ipcMain.handle(
    IPC_CHANNELS.promptOverrides.set,
    createIpcHandler(
      PromptOverrideSchemas.set,
      async ({ key, content }) => {
      },
      'Failed to save prompt override'
    )
  );

  /**
   * Reset a prompt to its default content.
   */
  ipcMain.handle(
    IPC_CHANNELS.promptOverrides.reset,
    createIpcHandler(
      PromptOverrideSchemas.reset,
      async ({ key }) => {
        promptOverrideService.resetToDefault(key);
      },
      'Failed to reset prompt'
    )
  );
}
