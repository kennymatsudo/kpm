/**
 * Tool log domain endpoint registry.
 *
 * `toollog:call` and `toollog:turn-summary` are broadcast events
 * (`webContents.send` / `ipcRenderer.on`) fired from `ToolCallLogger`, not
 * invoke endpoints, so they stay hand-declared in `src/preload/api.ts` and
 * out of this registry.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import type { ActivityType, ToolCallLogEntry } from '../types';

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/toollog.ts`): the handler returns bare data (or
 * `void`), and the registry loop wraps it as `{success: true, ...data}` /
 * `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

export const toolLogEndpoints = {
  getEntries: {
    channel: 'toollog:get-entries',
    params: z.object({ chatSessionId: z.string().min(1, 'chatSessionId is required') }),
    result: resultOf<RegistryResponse<{ entries: ToolCallLogEntry[] }>>(),
  },
  getSessionStats: {
    channel: 'toollog:get-session-stats',
    params: z.object({ chatSessionId: z.string().min(1, 'chatSessionId is required') }),
    result: resultOf<
      RegistryResponse<{
        stats: { totalCalls: number; byCategory: Partial<Record<ActivityType, number>>; topFiles: string[]; duplicateCount: number };
      }>
    >(),
  },
  getInfo: {
    channel: 'toollog:get-info',
    params: null,
    result: resultOf<RegistryResponse<{ enabled: boolean; logPath: string }>>(),
  },
  setEnabled: {
    channel: 'toollog:set-enabled',
    params: z.object({ enabled: z.boolean() }),
    result: resultOf<RegistryResponse>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type ToolLogEndpoints = typeof toolLogEndpoints;
export type ToolLogEndpointName = keyof ToolLogEndpoints;
