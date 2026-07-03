/**
 * Debug domain endpoint registry.
 *
 * One entry per `debug:*` IPC endpoint, keyed by the dotted method path used
 * on `window.api.debug`.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';

export const debugEndpoints = {
  setEnabled: {
    channel: 'debug:set-enabled',
    params: z.boolean(),
  },
  isEnabled: {
    channel: 'debug:is-enabled',
    params: null,
  },
} satisfies Record<string, EndpointDefinition>;

export type DebugEndpoints = typeof debugEndpoints;
export type DebugEndpointName = keyof DebugEndpoints;
