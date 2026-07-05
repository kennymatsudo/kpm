/**
 * Briefing domain endpoint registry.
 *
 * `briefing:chunk` is a streaming event (`sender.send` / `ipcRenderer.on`),
 * not an invoke endpoint, so it stays hand-declared in `src/preload/api.ts`
 * and `shared/ipcChannels.ts`.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';
import type { BriefingResult } from '../types';

/**
 * Response shape built by `toIpcResponseAsync`/`ipcSuccess`
 * (`main/ipc/response.ts`): `{success: true, data: T} | {success: false, error: string}`.
 */
type ToIpcResponse<T> = { success: true; data: T } | { success: false; error: string };

export const briefingEndpoints = {
  generate: {
    channel: 'briefing:generate',
    params: z.object({ projectId: uuid }),
    result: resultOf<ToIpcResponse<BriefingResult>>(),
  },
  get: {
    channel: 'briefing:get',
    params: z.object({ projectId: uuid }),
    result: resultOf<{ success: true; data: BriefingResult | null }>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type BriefingEndpoints = typeof briefingEndpoints;
export type BriefingEndpointName = keyof BriefingEndpoints;
