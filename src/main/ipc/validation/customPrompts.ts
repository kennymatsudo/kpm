/**
 * Custom Prompt Validation Schemas
 *
 * Zod schemas for custom prompt IPC operations.
 */

import { z } from 'zod';
import { uuid, nonEmptyString } from './shared';

// =============================================================================
// Custom Prompt Icon Schema
// =============================================================================

const customPromptIcon = z.enum(['chart', 'check', 'document', 'sparkles', 'clipboard']);

// =============================================================================
// Custom Prompt Schemas
// =============================================================================

export const CustomPromptSchemas = {
  list: z.object({}),

  get: z.object({
    promptId: uuid,
  }),

  create: z.object({
    name: nonEmptyString('Prompt name').max(100, 'Prompt name must be under 100 characters'),
    description: z.string().max(500, 'Description must be under 500 characters').nullable().optional(),
    promptContent: z.string().max(50000, 'Prompt content too long'),
    icon: customPromptIcon.optional(),
    keywords: z.string().max(500, 'Keywords must be under 500 characters').nullable().optional(),
  }),

  update: z.object({
    promptId: uuid,
    name: nonEmptyString('Prompt name').max(100, 'Prompt name must be under 100 characters').optional(),
    description: z.string().max(500, 'Description must be under 500 characters').nullable().optional(),
    promptContent: z.string().max(50000, 'Prompt content too long').optional(),
    icon: customPromptIcon.optional(),
    keywords: z.string().max(500, 'Keywords must be under 500 characters').nullable().optional(),
  }),

  delete: z.object({
    promptId: uuid,
  }),

  execute: z.object({
    promptId: uuid,
    projectId: uuid,
  }),
};

// =============================================================================
// Inferred Types
// =============================================================================

export type CustomPromptListInput = z.infer<typeof CustomPromptSchemas.list>;
export type CustomPromptGetInput = z.infer<typeof CustomPromptSchemas.get>;
export type CustomPromptCreateInput = z.infer<typeof CustomPromptSchemas.create>;
export type CustomPromptUpdateInput = z.infer<typeof CustomPromptSchemas.update>;
export type CustomPromptDeleteInput = z.infer<typeof CustomPromptSchemas.delete>;
export type CustomPromptExecuteInput = z.infer<typeof CustomPromptSchemas.execute>;
