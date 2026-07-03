/**
 * Tool log domain endpoint registry.
 *
 * `toollog:call` and `toollog:turn-summary` are broadcast events
 * (`webContents.send` / `ipcRenderer.on`) fired from `ToolCallLogger`, not
 * invoke endpoints, so they stay hand-declared in `src/preload/api.ts` and
 * out of this registry.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';

export const toolLogEndpoints = {
  getEntries: {
    channel: 'toollog:get-entries',
    params: z.object({ chatSessionId: z.string().min(1, 'chatSessionId is required') }),
  },
  getSessionStats: {
    channel: 'toollog:get-session-stats',
    params: z.object({ chatSessionId: z.string().min(1, 'chatSessionId is required') }),
  },
  getInfo: { channel: 'toollog:get-info', params: null },
  setEnabled: { channel: 'toollog:set-enabled', params: z.object({ enabled: z.boolean() }) },
} satisfies Record<string, EndpointDefinition>;

export type ToolLogEndpoints = typeof toolLogEndpoints;
export type ToolLogEndpointName = keyof ToolLogEndpoints;
