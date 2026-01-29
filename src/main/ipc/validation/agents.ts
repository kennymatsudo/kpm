/**
 * Task Prompt Template Validation Schemas
 */

import { z } from 'zod';
import { uuid, nonEmptyString } from './shared';

// =============================================================================
// Task Prompt Template Schemas
// =============================================================================

export const TaskPromptTemplateSchemas = {
  list: z.object({
    projectId: uuid.nullable().optional(),
  }),

  get: z.object({
    templateId: uuid,
  }),

  getEffective: z.object({
    projectId: uuid,
  }),

  getBuiltinDefault: z.object({}),

  create: z.object({
    projectId: uuid.nullable(),
    name: nonEmptyString('Template name').max(100, 'Template name must be under 100 characters'),
    promptContent: z.string().max(50000, 'Prompt content too long'),
  }),

  update: z.object({
    templateId: uuid,
    name: nonEmptyString('Template name').max(100, 'Template name must be under 100 characters').optional(),
    promptContent: z.string().max(50000, 'Prompt content too long').optional(),
  }),

  delete: z.object({
    templateId: uuid,
  }),

  setDefault: z.object({
    templateId: uuid,
  }),
};
