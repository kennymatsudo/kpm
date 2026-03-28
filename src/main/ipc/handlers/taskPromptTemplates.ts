/**
 * Task Prompt Template IPC handlers.
 *
 * Handles CRUD operations for task prompt templates.
 * Templates define how Claude creates plan items (title format, description structure, etc.).
 */

import { ipcMain } from 'electron';
import type { TaskPromptTemplateService } from '../../services/core/TaskPromptTemplateService';
import { createIpcHandler, createSimpleIpcHandler, TaskPromptTemplateSchemas } from '../validation';
import { IPC_CHANNELS } from '../channels';

export function registerTaskPromptTemplateHandlers(taskPromptTemplateService: TaskPromptTemplateService): void {
  /**
   * List all templates (optionally filtered by project).
   */
  ipcMain.handle(
    IPC_CHANNELS.taskPromptTemplates.list,
    createIpcHandler(
      TaskPromptTemplateSchemas.list,
      ({ projectId }) => {
        const result = taskPromptTemplateService.list(projectId);
        if (!result.ok) throw new Error(result.error);
        return { templates: result.data };
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
        const result = taskPromptTemplateService.get(templateId);
        if (!result.ok) throw new Error(result.error);
        return { template: result.data };
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
        const result = taskPromptTemplateService.getEffective(projectId);
        if (!result.ok) throw new Error(result.error);
        return { template: result.data };
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
        const result = taskPromptTemplateService.getBuiltinDefault();
        if (!result.ok) throw new Error(result.error);
        return result.data;
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
        const result = taskPromptTemplateService.create(projectId, name, promptContent);
        if (!result.ok) throw new Error(result.error);
        return { template: result.data };
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
        const result = taskPromptTemplateService.update(templateId, { name, promptContent });
        if (!result.ok) throw new Error(result.error);
        return { template: result.data };
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
        const result = taskPromptTemplateService.delete(templateId);
        if (!result.ok) throw new Error(result.error);
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
        const result = taskPromptTemplateService.setDefault(templateId);
        if (!result.ok) throw new Error(result.error);
        return { template: result.data };
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
      const result = taskPromptTemplateService.ensureDefault();
      if (!result.ok) throw new Error(result.error);
    }, 'Failed to ensure default template')
  );
}
