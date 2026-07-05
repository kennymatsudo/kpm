/**
 * Perf domain endpoint registry.
 *
 * One entry per `perf:*` IPC endpoint, keyed by the dotted method path used
 * on `window.api.perf`.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/perf.ts`): the handler returns bare data (or
 * `void`), and the registry loop wraps it as `{success: true, ...data}` /
 * `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

/**
 * Mirrors `PerfLogInfo` from `main/services/PerfLogger.ts` — not re-imported
 * from there to avoid a shared/ -> main/ dependency.
 */
interface PerfLogInfo {
  enabled: boolean;
  logPath?: string;
  sessionId?: string;
}

export const perfEndpoints = {
  log: {
    channel: 'perf:log',
    params: z.object({
      name: z.string().min(1, 'Event name is required'),
      durationMs: z.number().nonnegative().optional(),
      meta: z.record(z.string(), z.unknown()).optional(),
    }),
    result: resultOf<RegistryResponse>(),
  },
  getLogInfo: {
    channel: 'perf:get-log-info',
    params: null,
    result: resultOf<RegistryResponse<PerfLogInfo>>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type PerfEndpoints = typeof perfEndpoints;
export type PerfEndpointName = keyof PerfEndpoints;
