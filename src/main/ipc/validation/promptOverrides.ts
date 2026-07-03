/**
 * Prompt Override Validation Schemas
 */

import type { z } from 'zod';
import { promptOverridesEndpoints } from '../../../shared/ipc/promptOverridesEndpoints';

// =============================================================================
// Prompt Override Schemas
// =============================================================================

export const PromptOverrideSchemas = {
  /** List prompts, optionally filtered by category */
  list: promptOverridesEndpoints.list.params,

  /** Get a prompt's current content and metadata */
  get: promptOverridesEndpoints.get.params,

  /** Set a prompt override */
  set: promptOverridesEndpoints.set.params,

  /** Reset a prompt to its default */
  reset: promptOverridesEndpoints.reset.params,
};

// =============================================================================
// Inferred Types
// =============================================================================

export type PromptOverrideListInput = z.infer<typeof PromptOverrideSchemas.list>;
export type PromptOverrideGetInput = z.infer<typeof PromptOverrideSchemas.get>;
export type PromptOverrideSetInput = z.infer<typeof PromptOverrideSchemas.set>;
export type PromptOverrideResetInput = z.infer<typeof PromptOverrideSchemas.reset>;
