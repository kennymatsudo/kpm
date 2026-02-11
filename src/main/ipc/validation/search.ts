/**
 * Search Validation Schemas
 */

import { z } from 'zod';
import { uuid } from './shared';

export const SearchSchemas = {
  global: z.object({
    projectId: uuid,
    query: z.string().min(1).max(200),
    limit: z.number().int().min(1).max(200).optional(),
  }),
};

export type SearchGlobalInput = z.infer<typeof SearchSchemas.global>;
