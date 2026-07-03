/**
 * Claude usage tracking domain endpoint registry.
 *
 * `usage:event` is a live broadcast event (`webContents.send` /
 * `ipcRenderer.on`), not an invoke endpoint, so it stays hand-declared in
 * `src/preload/api.ts` and is not part of `IPC_CHANNELS.usage`.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';


export const usageEndpoints = {
  getProjectStats: { channel: 'usage:get-project-stats', params: z.object({ projectId: uuid }) },
  getGlobalStats: { channel: 'usage:get-global-stats', params: z.object({}).optional() },
  listEvents: {
    channel: 'usage:list-events',
    params: z.object({ projectId: uuid.nullable(), limit: z.number().int().min(1).max(500).optional() }),
  },
  resetProject: { channel: 'usage:reset-project', params: z.object({ projectId: uuid }) },
} satisfies Record<string, EndpointDefinition>;

export type UsageEndpoints = typeof usageEndpoints;
export type UsageEndpointName = keyof UsageEndpoints;
