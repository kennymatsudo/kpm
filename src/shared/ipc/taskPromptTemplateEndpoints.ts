/**
 * Task prompt template domain endpoint registry.
 *
 * One entry per `task-prompt-templates:*` IPC endpoint, keyed by the dotted
 * method path used on `window.api.taskPromptTemplates`.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';
import type { TaskPromptTemplate } from '../types';

const nonEmptyString = (fieldName: string) => z.string().min(1, `${fieldName} cannot be empty`).trim();

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/taskPromptTemplates.ts`): the handler returns bare
 * data (or `void`), and the registry loop wraps it as `{success: true,
 * ...data}` / `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

export const taskPromptTemplateEndpoints = {
  list: {
    channel: 'task-prompt-templates:list',
    params: z.object({ projectId: uuid.nullable().optional() }),
    result: resultOf<RegistryResponse<{ templates: TaskPromptTemplate[] }>>(),
  },
  get: {
    channel: 'task-prompt-templates:get',
    params: z.object({ templateId: uuid }),
    result: resultOf<RegistryResponse<{ template: TaskPromptTemplate }>>(),
  },
  getEffective: {
    channel: 'task-prompt-templates:get-effective',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse<{ template: TaskPromptTemplate }>>(),
  },
  getBuiltinDefault: {
    channel: 'task-prompt-templates:get-builtin-default',
    params: z.object({}),
    result: resultOf<RegistryResponse<{ promptContent: string }>>(),
  },
  create: {
    channel: 'task-prompt-templates:create',
    params: z.object({
      projectId: uuid.nullable(),
      name: nonEmptyString('Template name').max(100, 'Template name must be under 100 characters'),
      promptContent: z.string().max(50000, 'Prompt content too long'),
    }),
    result: resultOf<RegistryResponse<{ template: TaskPromptTemplate }>>(),
  },
  update: {
    channel: 'task-prompt-templates:update',
    params: z.object({
      templateId: uuid,
      name: nonEmptyString('Template name').max(100, 'Template name must be under 100 characters').optional(),
      promptContent: z.string().max(50000, 'Prompt content too long').optional(),
    }),
    result: resultOf<RegistryResponse<{ template: TaskPromptTemplate }>>(),
  },
  delete: {
    channel: 'task-prompt-templates:delete',
    params: z.object({ templateId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  setDefault: {
    channel: 'task-prompt-templates:set-default',
    params: z.object({ templateId: uuid }),
    result: resultOf<RegistryResponse<{ template: TaskPromptTemplate }>>(),
  },
  ensureDefault: {
    channel: 'task-prompt-templates:ensure-default',
    params: null,
    result: resultOf<RegistryResponse>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type TaskPromptTemplateEndpoints = typeof taskPromptTemplateEndpoints;
export type TaskPromptTemplateEndpointName = keyof TaskPromptTemplateEndpoints;
