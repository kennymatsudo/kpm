/**
 * Task Prompt Template IPC handlers.
 *
 * Handles CRUD operations for task prompt templates.
 * Templates define how Claude creates plan items (title format, description structure, etc.).
 */

import type { TaskPromptTemplateService } from '../../services/core/TaskPromptTemplateService';
import { createRegistryIpcHandlers } from '../validation/utils';
import { taskPromptTemplateEndpoints, type TaskPromptTemplateEndpointName } from '../../../shared/ipc/taskPromptTemplateEndpoints';
import type { EndpointPayload } from '../../../shared/ipc/endpoints';

type TaskPromptTemplateHandler<K extends TaskPromptTemplateEndpointName> = (
  params: EndpointPayload<(typeof taskPromptTemplateEndpoints)[K]>
) => unknown;

/**
 * One handler per `taskPromptTemplateEndpoints` entry. A registry entry
 * without a matching key here is a compile error, not a runtime "no
 * handler" failure.
 */
type TaskPromptTemplateHandlers = { [K in TaskPromptTemplateEndpointName]: TaskPromptTemplateHandler<K> };

function buildTaskPromptTemplateHandlers(
  taskPromptTemplateService: TaskPromptTemplateService,
): TaskPromptTemplateHandlers {
  return {
    list: ({ projectId }) => {
      const result = taskPromptTemplateService.list(projectId);
      if (!result.ok) throw new Error(result.error);
      return { templates: result.data };
    },

    get: ({ templateId }) => {
      const result = taskPromptTemplateService.get(templateId);
      if (!result.ok) throw new Error(result.error);
      return { template: result.data };
    },

    getEffective: ({ projectId }) => {
      const result = taskPromptTemplateService.getEffective(projectId);
      if (!result.ok) throw new Error(result.error);
      return { template: result.data };
    },

    getBuiltinDefault: () => {
      const result = taskPromptTemplateService.getBuiltinDefault();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },

    create: ({ projectId, name, promptContent }) => {
      const result = taskPromptTemplateService.create(projectId, name, promptContent);
      if (!result.ok) throw new Error(result.error);
      return { template: result.data };
    },

    update: ({ templateId, name, promptContent }) => {
      const result = taskPromptTemplateService.update(templateId, { name, promptContent });
      if (!result.ok) throw new Error(result.error);
      return { template: result.data };
    },

    delete: ({ templateId }) => {
      const result = taskPromptTemplateService.delete(templateId);
      if (!result.ok) throw new Error(result.error);
    },

    setDefault: ({ templateId }) => {
      const result = taskPromptTemplateService.setDefault(templateId);
      if (!result.ok) throw new Error(result.error);
      return { template: result.data };
    },

    ensureDefault: () => {
      const result = taskPromptTemplateService.ensureDefault();
      if (!result.ok) throw new Error(result.error);
    },
  };
}

export function registerTaskPromptTemplateHandlers(taskPromptTemplateService: TaskPromptTemplateService): void {
  createRegistryIpcHandlers(
    taskPromptTemplateEndpoints,
    buildTaskPromptTemplateHandlers(taskPromptTemplateService),
    'Task prompt template operation failed'
  );
}
