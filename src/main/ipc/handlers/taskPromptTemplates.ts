/**
 * Task Prompt Template IPC handlers.
 *
 * Handles CRUD operations for task prompt templates.
 * Templates define how Claude creates plan items (title format, description structure, etc.).
 */

import { ipcMain } from 'electron';
import { createIpcHandler, createSimpleIpcHandler, TaskPromptTemplateSchemas } from '../validation';

  /**
   * List all templates (optionally filtered by project).
   */
  ipcMain.handle(
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
    createSimpleIpcHandler(() => {
    }, 'Failed to ensure default template')
  );
}
