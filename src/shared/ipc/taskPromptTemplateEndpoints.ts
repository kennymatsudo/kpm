/**
 * Task prompt template domain endpoint registry.
 *
 * One entry per `task-prompt-templates:*` IPC endpoint, keyed by the dotted
 * method path used on `window.api.taskPromptTemplates`.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';

const nonEmptyString = (fieldName: string) => z.string().min(1, `${fieldName} cannot be empty`).trim();

export const taskPromptTemplateEndpoints = {
  list: {
    channel: 'task-prompt-templates:list',
    params: z.object({ projectId: uuid.nullable().optional() }),
  },
  get: {
    channel: 'task-prompt-templates:get',
    params: z.object({ templateId: uuid }),
  },
  getEffective: {
    channel: 'task-prompt-templates:get-effective',
    params: z.object({ projectId: uuid }),
  },
  getBuiltinDefault: {
    channel: 'task-prompt-templates:get-builtin-default',
    params: z.object({}),
  },
  create: {
    channel: 'task-prompt-templates:create',
    params: z.object({
      projectId: uuid.nullable(),
      name: nonEmptyString('Template name').max(100, 'Template name must be under 100 characters'),
      promptContent: z.string().max(50000, 'Prompt content too long'),
    }),
  },
  update: {
    channel: 'task-prompt-templates:update',
    params: z.object({
      templateId: uuid,
      name: nonEmptyString('Template name').max(100, 'Template name must be under 100 characters').optional(),
      promptContent: z.string().max(50000, 'Prompt content too long').optional(),
    }),
  },
  delete: {
    channel: 'task-prompt-templates:delete',
    params: z.object({ templateId: uuid }),
  },
  setDefault: {
    channel: 'task-prompt-templates:set-default',
    params: z.object({ templateId: uuid }),
  },
  ensureDefault: {
    channel: 'task-prompt-templates:ensure-default',
    params: null,
  },
} satisfies Record<string, EndpointDefinition>;

export type TaskPromptTemplateEndpoints = typeof taskPromptTemplateEndpoints;
export type TaskPromptTemplateEndpointName = keyof TaskPromptTemplateEndpoints;
