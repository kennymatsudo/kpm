/**
 * Custom Prompt Validation Schemas
 *
 * Payload schemas are owned by `shared/ipc/customPromptEndpoints.ts` (one
 * entry per IPC endpoint, shared with the preload bridge and the handler
 * binding).
 */

import type { z } from 'zod';
import { customPromptEndpoints } from '../../../shared/ipc/customPromptEndpoints';

export const CustomPromptSchemas = {
  list: customPromptEndpoints.list.params,
  get: customPromptEndpoints.get.params,
  create: customPromptEndpoints.create.params,
  update: customPromptEndpoints.update.params,
  delete: customPromptEndpoints.delete.params,
  execute: customPromptEndpoints.execute.params,
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
