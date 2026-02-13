/**
 * Task Prompt Template IPC handlers.
 *
 * Handles CRUD operations for task prompt templates.
 * Templates define how Claude creates plan items (title format, description structure, etc.).
 */

import { ipcMain } from 'electron';
import { createIpcHandler, createSimpleIpcHandler, TaskPromptTemplateSchemas } from '../validation';
import { IPC_CHANNELS } from '../channels';

  /**
   * List all templates (optionally filtered by project).
   */
  ipcMain.handle(
    IPC_CHANNELS.taskPromptTemplates.list,
    createIpcHandler(
      TaskPromptTemplateSchemas.list,
      ({ projectId }) => {
      },
      'Failed to list templates'
    )
  );

  /**
   * Get a specific template by ID.
   */
  ipcMain.handle(
    IPC_CHANNELS.taskPromptTemplates.get,
    createIpcHandler(
      TaskPromptTemplateSchemas.get,
      ({ templateId }) => {
      },
      'Failed to get template'
    )
  );

  /**
   * Get the effective template for a project.
   * Resolution order: project default -> project "default" -> global default -> global "default" -> fallback
   */
  ipcMain.handle(
    IPC_CHANNELS.taskPromptTemplates.getEffective,
    createIpcHandler(
      TaskPromptTemplateSchemas.getEffective,
      ({ projectId }) => {
      },
      'Failed to get effective template'
    )
  );

  /**
   * Get the built-in default prompt content.
   * Used for "Reset to Default" functionality.
   */
  ipcMain.handle(
    IPC_CHANNELS.taskPromptTemplates.getBuiltinDefault,
    createIpcHandler(
      TaskPromptTemplateSchemas.getBuiltinDefault,
      () => {
      },
      'Failed to get builtin default'
    )
  );

  /**
   * Create a new template.
   */
  ipcMain.handle(
    IPC_CHANNELS.taskPromptTemplates.create,
    createIpcHandler(
      TaskPromptTemplateSchemas.create,
      ({ projectId, name, promptContent }) => {
      },
      'Failed to create template'
    )
  );

  /**
   * Update an existing template.
   */
  ipcMain.handle(
    IPC_CHANNELS.taskPromptTemplates.update,
    createIpcHandler(
      TaskPromptTemplateSchemas.update,
      ({ templateId, name, promptContent }) => {
      },
      'Failed to update template'
    )
  );

  /**
   * Delete a template.
   */
  ipcMain.handle(
    IPC_CHANNELS.taskPromptTemplates.delete,
    createIpcHandler(
      TaskPromptTemplateSchemas.delete,
      ({ templateId }) => {
      },
      'Failed to delete template'
    )
  );

  /**
   * Set a template as the default for its scope.
   */
  ipcMain.handle(
    IPC_CHANNELS.taskPromptTemplates.setDefault,
    createIpcHandler(
      TaskPromptTemplateSchemas.setDefault,
      ({ templateId }) => {
      },
      'Failed to set default template'
    )
  );

  /**
   * Ensure a default global template exists (called on app start).
   */
  ipcMain.handle(
    IPC_CHANNELS.taskPromptTemplates.ensureDefault,
    createSimpleIpcHandler(() => {
    }, 'Failed to ensure default template')
  );
}
