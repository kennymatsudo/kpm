/**
 * Briefing Validation Schemas
 */

import { z } from 'zod';
import { uuid } from './shared';

export const BriefingSchemas = {
  generate: z.object({ projectId: uuid }),
  get: z.object({ projectId: uuid }),
};
