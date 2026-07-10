/**
 * Prompt overrides domain endpoint registry.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import type { PromptDefinitionInfo } from '../types';

/**
 * Mirrors `PromptDefinition` from `main/chat/prompts/promptRegistry.ts` —
 * not re-imported from there to avoid a shared/ -> main/ dependency.
 */
interface PromptDefinitionWithContent {
  key: string;
  name: string;
  description: string;
  category: 'system' | 'generation' | 'agents';
  defaultContent: string;
  variables?: { name: string; description: string }[];
  hasOverride: boolean;
  currentContent: string;
}

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/promptOverrides.ts`): the handler returns bare data
 * (or `void`), and the registry loop wraps it as `{success: true, ...data}` /
 * `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

export const promptOverridesEndpoints = {
  list: {
    channel: 'prompt-overrides:list',
    params: z.object({ category: z.enum(['system', 'generation', 'agents']).optional() }),
    result: resultOf<RegistryResponse<{ prompts: PromptDefinitionInfo[] }>>(),
  },
  get: {
    channel: 'prompt-overrides:get',
    params: z.object({ key: z.string().min(1) }),
    result: resultOf<RegistryResponse<{ prompt: PromptDefinitionWithContent }>>(),
  },
  set: {
    channel: 'prompt-overrides:set',
    params: z.object({ key: z.string().min(1), content: z.string().min(1) }),
    result: resultOf<RegistryResponse>(),
  },
  reset: {
    channel: 'prompt-overrides:reset',
    params: z.object({ key: z.string().min(1) }),
    result: resultOf<RegistryResponse>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type PromptOverridesEndpoints = typeof promptOverridesEndpoints;
export type PromptOverridesEndpointName = keyof PromptOverridesEndpoints;
