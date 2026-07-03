/**
 * Task Prompt Template Validation Schemas
 *
 * Payload schemas are owned by `shared/ipc/taskPromptTemplateEndpoints.ts`
 * (one entry per IPC endpoint, shared with the preload bridge and the
 * handler binding).
 */

import { taskPromptTemplateEndpoints } from '../../../shared/ipc/taskPromptTemplateEndpoints';

export const TaskPromptTemplateSchemas = {
  list: taskPromptTemplateEndpoints.list.params,
  get: taskPromptTemplateEndpoints.get.params,
  getEffective: taskPromptTemplateEndpoints.getEffective.params,
  getBuiltinDefault: taskPromptTemplateEndpoints.getBuiltinDefault.params,
  create: taskPromptTemplateEndpoints.create.params,
  update: taskPromptTemplateEndpoints.update.params,
  delete: taskPromptTemplateEndpoints.delete.params,
  setDefault: taskPromptTemplateEndpoints.setDefault.params,
};
