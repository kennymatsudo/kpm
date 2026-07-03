/**
 * Storybook domain endpoint registry.
 *
 * Handlers live in `main/ipc/handlers/projects.ts` alongside the (as yet
 * unmigrated) `project` domain, since `registerProjectHandlers` registers
 * both together against the same `ProjectService`.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';


export const storybookEndpoints = {
  updateUrl: {
    channel: 'storybook:update-url',
    params: z.object({ projectId: uuid, storybookUrl: z.string().url('Must be a valid URL').nullable() }),
  },
  testConnection: {
    channel: 'storybook:test-connection',
    params: z.object({ url: z.string().url('Must be a valid URL') }),
  },
} satisfies Record<string, EndpointDefinition>;

export type StorybookEndpoints = typeof storybookEndpoints;
export type StorybookEndpointName = keyof StorybookEndpoints;
