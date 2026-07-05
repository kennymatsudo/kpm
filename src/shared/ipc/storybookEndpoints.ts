/**
 * Storybook domain endpoint registry.
 *
 * Handlers live in `main/ipc/handlers/projects.ts` alongside the (as yet
 * unmigrated) `project` domain, since `registerProjectHandlers` registers
 * both together against the same `ProjectService`.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/projects.ts`): the handler returns bare data (or
 * `void`), and the registry loop wraps it as `{success: true, ...data}` /
 * `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

export const storybookEndpoints = {
  updateUrl: {
    channel: 'storybook:update-url',
    params: z.object({ projectId: uuid, storybookUrl: z.string().url('Must be a valid URL').nullable() }),
    result: resultOf<RegistryResponse>(),
  },
  testConnection: {
    channel: 'storybook:test-connection',
    params: z.object({ url: z.string().url('Must be a valid URL') }),
    result: resultOf<RegistryResponse<{ componentCount: number }>>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type StorybookEndpoints = typeof storybookEndpoints;
export type StorybookEndpointName = keyof StorybookEndpoints;
