/**
 * Briefing domain endpoint registry.
 *
 * `briefing:chunk` is a streaming event (`sender.send` / `ipcRenderer.on`),
 * not an invoke endpoint, so it stays hand-declared in `src/preload/api.ts`
 * and `shared/ipcChannels.ts`.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';


export const briefingEndpoints = {
  generate: { channel: 'briefing:generate', params: z.object({ projectId: uuid }) },
  get: { channel: 'briefing:get', params: z.object({ projectId: uuid }) },
} satisfies Record<string, EndpointDefinition>;

export type BriefingEndpoints = typeof briefingEndpoints;
export type BriefingEndpointName = keyof BriefingEndpoints;
