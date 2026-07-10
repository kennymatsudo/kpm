/**
 * Claude usage tracking domain endpoint registry.
 *
 * `usage:event` is a live broadcast event (`webContents.send` /
 * `ipcRenderer.on`), not an invoke endpoint, so it stays hand-declared in
 * `src/preload/api.ts` and is not part of `IPC_CHANNELS.usage`.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';
import type { ClaudeUsageEvent, ProjectUsageStats } from '../usage-types';


export const usageEndpoints = {
  getProjectStats: {
    channel: 'usage:get-project-stats',
    params: z.object({ projectId: uuid }),
    result: resultOf<ProjectUsageStats>(),
  },
  getGlobalStats: {
    channel: 'usage:get-global-stats',
    params: z.object({}).optional(),
    result: resultOf<ProjectUsageStats>(),
  },
  listEvents: {
    channel: 'usage:list-events',
    params: z.object({ projectId: uuid.nullable(), limit: z.number().int().min(1).max(500).optional() }),
    result: resultOf<ClaudeUsageEvent[]>(),
  },
  getDevSessionStepCosts: {
    channel: 'usage:get-dev-session-step-costs',
    params: z.object({ devSessionId: uuid }),
    result: resultOf<{ costs: Record<string, number> }>(),
  },
  resetProject: {
    channel: 'usage:reset-project',
    params: z.object({ projectId: uuid }),
    result: resultOf<{ success: boolean }>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type UsageEndpoints = typeof usageEndpoints;
export type UsageEndpointName = keyof UsageEndpoints;
