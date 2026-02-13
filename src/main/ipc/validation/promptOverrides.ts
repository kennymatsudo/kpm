/**
 * Prompt Override Validation Schemas
 */

import { z } from 'zod';

// =============================================================================
// Prompt Override Schemas
// =============================================================================

export const PromptOverrideSchemas = {
  /** List prompts, optionally filtered by category */
  list: z.object({
  }),

  /** Get a prompt's current content and metadata */
  get: z.object({
    key: z.string().min(1),
  }),

  /** Set a prompt override */
  set: z.object({
    key: z.string().min(1),
    content: z.string().min(1),
  }),

  /** Reset a prompt to its default */
  reset: z.object({
    key: z.string().min(1),
  }),
};

// =============================================================================
// Inferred Types
// =============================================================================

export type PromptOverrideListInput = z.infer<typeof PromptOverrideSchemas.list>;
export type PromptOverrideGetInput = z.infer<typeof PromptOverrideSchemas.get>;
export type PromptOverrideSetInput = z.infer<typeof PromptOverrideSchemas.set>;
export type PromptOverrideResetInput = z.infer<typeof PromptOverrideSchemas.reset>;
