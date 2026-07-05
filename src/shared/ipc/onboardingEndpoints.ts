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
import { resultOf, type EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/onboarding.ts`): the handler returns bare data (or
 * `void`), and the registry loop wraps it as `{success: true, ...data}` /
 * `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

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
    result: resultOf<RegistryResponse<{ taskId: string }>>(),
  },
  saveContext: {
    channel: 'onboarding:save-context',
    params: z.object({ projectId: uuid, content: z.string().min(1, 'Content cannot be empty') }),
    result: resultOf<RegistryResponse>(),
  },
  saveContextDirectories: {
    channel: 'onboarding:save-context-directories',
    params: z.object({ projectId: uuid, repoDirectories }),
    result: resultOf<RegistryResponse>(),
  },
  getContextDirectories: {
    channel: 'onboarding:get-context-directories',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse<{ directories: Record<string, string[]> | null }>>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type OnboardingEndpoints = typeof onboardingEndpoints;
export type OnboardingEndpointName = keyof OnboardingEndpoints;
