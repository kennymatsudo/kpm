/**
 * Claude Usage Tracking Validation Schemas
 */

import { z } from 'zod';
import { uuid } from './shared';

export const UsageSchemas = {
  getProjectStats: z.object({ projectId: uuid }),
  getGlobalStats: z.object({}).optional(),
  listEvents: z.object({
    projectId: uuid.nullable(),
    limit: z.number().int().min(1).max(500).optional(),
  }),
  resetProject: z.object({ projectId: uuid }),
};
