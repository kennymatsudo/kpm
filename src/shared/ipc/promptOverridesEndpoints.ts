/**
 * Prompt overrides domain endpoint registry.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';

export const promptOverridesEndpoints = {
  list: {
    channel: 'prompt-overrides:list',
    params: z.object({ category: z.enum(['system', 'generation', 'agents']).optional() }),
  },
  get: { channel: 'prompt-overrides:get', params: z.object({ key: z.string().min(1) }) },
  set: {
    channel: 'prompt-overrides:set',
    params: z.object({ key: z.string().min(1), content: z.string().min(1) }),
  },
  reset: { channel: 'prompt-overrides:reset', params: z.object({ key: z.string().min(1) }) },
} satisfies Record<string, EndpointDefinition>;

export type PromptOverridesEndpoints = typeof promptOverridesEndpoints;
export type PromptOverridesEndpointName = keyof PromptOverridesEndpoints;
