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
import { resultOf, type EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';
import type { CustomPrompt } from '../types';

const nonEmptyString = (fieldName: string) => z.string().min(1, `${fieldName} cannot be empty`).trim();

const customPromptIcon = z.enum(['chart', 'check', 'document', 'sparkles', 'clipboard']);
const customPromptTargetType = z.enum(['none', 'document', 'repo']);
const customPromptRunMode = z.enum(['artifact', 'chat']);

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/customPrompts.ts`): the handler returns bare data
 * (or `void`), and the registry loop wraps it as `{success: true, ...data}` /
 * `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

export const customPromptEndpoints = {
  list: {
    channel: 'custom-prompts:list',
    params: z.object({}),
    result: resultOf<RegistryResponse<{ prompts: CustomPrompt[] }>>(),
  },
  get: {
    channel: 'custom-prompts:get',
    params: z.object({ promptId: uuid }),
    result: resultOf<RegistryResponse<{ prompt: CustomPrompt }>>(),
  },
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
    result: resultOf<RegistryResponse<{ prompt: CustomPrompt }>>(),
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
    result: resultOf<RegistryResponse>(),
  },
  delete: {
    channel: 'custom-prompts:delete',
    params: z.object({ promptId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  execute: {
    channel: 'custom-prompts:execute',
    params: z.object({ promptId: uuid, projectId: uuid }),
    result: resultOf<RegistryResponse<{ taskId: string }>>(),
  },
  ensureBuiltins: {
    channel: 'custom-prompts:ensure-builtins',
    params: null,
    result: resultOf<RegistryResponse>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type CustomPromptEndpoints = typeof customPromptEndpoints;
export type CustomPromptEndpointName = keyof CustomPromptEndpoints;
