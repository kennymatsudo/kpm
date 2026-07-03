/**
 * Plan Item and Plan Action Validation Schemas
 *
 * Payload schemas are owned by `shared/ipc/planEndpoints.ts` (one entry per
 * IPC endpoint, shared with the preload bridge and the handler binding).
 */

import { planEndpoints } from '../../../shared/ipc/planEndpoints';
import { planActionSchema } from '../../../shared/planActionSchema';

/** Schema for PlanAction — generated from src/shared/planActionSchema.ts */
export { planActionSchema };

export const PlanSchemas = {
  listItems: planEndpoints.listItems.params,
  executeActions: planEndpoints.executeActions.params,
  addRelation: planEndpoints.addRelation.params,
  removeRelation: planEndpoints.removeRelation.params,
  getRelations: planEndpoints.getRelations.params,
  updatePosition: planEndpoints.updatePosition.params,
  updatePositions: planEndpoints.updatePositions.params,
  updateItem: planEndpoints.updateItem.params,
  deleteItem: planEndpoints.deleteItem.params,
  deleteItemWithDescendants: planEndpoints.deleteItemWithDescendants.params,
  getChildCount: planEndpoints.getChildCount.params,
};
