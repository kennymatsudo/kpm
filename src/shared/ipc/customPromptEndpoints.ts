/**
 * Custom prompt domain endpoint registry (Command+K palette prompts).
 *
 * One entry per `custom-prompts:*` IPC endpoint, keyed by the dotted method
 * path used on `window.api.customPrompts`.
 *
 * `custom-prompt:progress`/`custom-prompt:complete`/`custom-prompt:error`
 * (main -> renderer events fired while a prompt executes) are not invoke
 * endpoints and stay hand-written in `preload/api.ts`.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';

const nonEmptyString = (fieldName: string) => z.string().min(1, `${fieldName} cannot be empty`).trim();

const customPromptIcon = z.enum(['chart', 'check', 'document', 'sparkles', 'clipboard']);
const customPromptTargetType = z.enum(['none', 'document', 'repo']);
const customPromptRunMode = z.enum(['artifact', 'chat']);

export const customPromptEndpoints = {
  list: { channel: 'custom-prompts:list', params: z.object({}) },
  get: { channel: 'custom-prompts:get', params: z.object({ promptId: uuid }) },
  create: {
    channel: 'custom-prompts:create',
    params: z.object({
      name: nonEmptyString('Prompt name').max(100, 'Prompt name must be under 100 characters'),
      description: z.string().max(500, 'Description must be under 500 characters').nullable().optional(),
      promptContent: z.string().max(50000, 'Prompt content too long'),
      icon: customPromptIcon.optional(),
      keywords: z.string().max(500, 'Keywords must be under 500 characters').nullable().optional(),
      targetType: customPromptTargetType.optional(),
      runMode: customPromptRunMode.optional(),
    }),
  },
  update: {
    channel: 'custom-prompts:update',
    params: z.object({
      promptId: uuid,
      name: nonEmptyString('Prompt name').max(100, 'Prompt name must be under 100 characters').optional(),
      description: z.string().max(500, 'Description must be under 500 characters').nullable().optional(),
      promptContent: z.string().max(50000, 'Prompt content too long').optional(),
      icon: customPromptIcon.optional(),
      keywords: z.string().max(500, 'Keywords must be under 500 characters').nullable().optional(),
      targetType: customPromptTargetType.optional(),
      runMode: customPromptRunMode.optional(),
    }),
  },
  delete: { channel: 'custom-prompts:delete', params: z.object({ promptId: uuid }) },
  execute: {
    channel: 'custom-prompts:execute',
    params: z.object({ promptId: uuid, projectId: uuid }),
  },
  ensureBuiltins: { channel: 'custom-prompts:ensure-builtins', params: null },
} satisfies Record<string, EndpointDefinition>;

export type CustomPromptEndpoints = typeof customPromptEndpoints;
export type CustomPromptEndpointName = keyof CustomPromptEndpoints;
