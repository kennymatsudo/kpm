/**
 * Onboarding domain endpoint registry (project setup wizard).
 *
 * One entry per `onboarding:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.onboarding`.
 *
 * `onboarding:progress`/`onboarding:thinking`/`onboarding:complete`/
 * `onboarding:error` (main -> renderer events fired while generation runs)
 * are not invoke endpoints and stay hand-written in `preload/api.ts`.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';

const repoDirectories = z.record(z.string(), z.array(z.string())).default({});

export const onboardingEndpoints = {
  generate: {
    channel: 'onboarding:generate',
    params: z.object({
      taskId: z.string().min(1),
      projectId: uuid,
      description: z.string().max(10000).default(''),
      repoDirectories,
    }),
  },
  saveContext: {
    channel: 'onboarding:save-context',
    params: z.object({ projectId: uuid, content: z.string().min(1, 'Content cannot be empty') }),
  },
  saveContextDirectories: {
    channel: 'onboarding:save-context-directories',
    params: z.object({ projectId: uuid, repoDirectories }),
  },
  getContextDirectories: {
    channel: 'onboarding:get-context-directories',
    params: z.object({ projectId: uuid }),
  },
} satisfies Record<string, EndpointDefinition>;

export type OnboardingEndpoints = typeof onboardingEndpoints;
export type OnboardingEndpointName = keyof OnboardingEndpoints;
