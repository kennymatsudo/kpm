/**
 * Search domain endpoint registry.
 *
 * One entry per `search:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.search`.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';
import type { SearchResult } from '../types';


export const searchEndpoints = {
  global: {
    channel: 'search:global',
    params: z.object({
      projectId: uuid,
      query: z.string().min(1).max(200),
      limit: z.number().int().min(1).max(200).optional(),
    }),
    result: resultOf<SearchResult[]>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type SearchEndpoints = typeof searchEndpoints;
export type SearchEndpointName = keyof SearchEndpoints;
