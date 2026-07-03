/**
 * Search Validation Schemas
 */

import type { z } from 'zod';
import { searchEndpoints } from '../../../shared/ipc/searchEndpoints';

export const SearchSchemas = {
  global: searchEndpoints.global.params,
};

export type SearchGlobalInput = z.infer<typeof SearchSchemas.global>;
