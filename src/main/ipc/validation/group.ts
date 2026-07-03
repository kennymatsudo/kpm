/**
 * Group IPC Validation Schemas
 *
 * Payload schemas are owned by `shared/ipc/groupEndpoints.ts` (one entry per
 * IPC endpoint, shared with the preload bridge and the handler binding).
 */

import type { z } from 'zod';
import { groupEndpoints } from '../../../shared/ipc/groupEndpoints';

export const GroupSchemas = {
  list: groupEndpoints.list.params,
  get: groupEndpoints.get.params,
  create: groupEndpoints.create.params,
  update: groupEndpoints.update.params,
  delete: groupEndpoints.delete.params,
  updatePosition: groupEndpoints.updatePosition.params,
  updateSize: groupEndpoints.updateSize.params,
  assignItem: groupEndpoints.assignItem.params,
};

// =============================================================================
// Inferred Types
// =============================================================================

export type GroupListInput = z.infer<typeof GroupSchemas.list>;
export type GroupGetInput = z.infer<typeof GroupSchemas.get>;
export type GroupCreateInput = z.infer<typeof GroupSchemas.create>;
export type GroupUpdateInput = z.infer<typeof GroupSchemas.update>;
export type GroupDeleteInput = z.infer<typeof GroupSchemas.delete>;
export type GroupUpdatePositionInput = z.infer<typeof GroupSchemas.updatePosition>;
export type GroupUpdateSizeInput = z.infer<typeof GroupSchemas.updateSize>;
export type GroupAssignItemInput = z.infer<typeof GroupSchemas.assignItem>;
