/**
 * Perf domain endpoint registry.
 *
 * One entry per `perf:*` IPC endpoint, keyed by the dotted method path used
 * on `window.api.perf`.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';

export const perfEndpoints = {
  log: {
    channel: 'perf:log',
    params: z.object({
      name: z.string().min(1, 'Event name is required'),
      durationMs: z.number().nonnegative().optional(),
      meta: z.record(z.string(), z.unknown()).optional(),
    }),
  },
  getLogInfo: {
    channel: 'perf:get-log-info',
    params: null,
  },
} satisfies Record<string, EndpointDefinition>;

export type PerfEndpoints = typeof perfEndpoints;
export type PerfEndpointName = keyof PerfEndpoints;
