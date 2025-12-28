/**
 */

import { z } from 'zod';

// =============================================================================
// =============================================================================

  list: z.object({
    projectId: uuid.nullable().optional(),
  }),

  get: z.object({
    templateId: uuid,
  }),

  getEffective: z.object({
    projectId: uuid,
  }),

  create: z.object({
    projectId: uuid.nullable(),
    name: nonEmptyString('Template name').max(100, 'Template name must be under 100 characters'),
  }),

  update: z.object({
    templateId: uuid,
    name: nonEmptyString('Template name').max(100, 'Template name must be under 100 characters').optional(),
  }),

  delete: z.object({
    templateId: uuid,
  }),

  setDefault: z.object({
    templateId: uuid,
  }),
};
