/**
 * Plan Item and Plan Action Validation Schemas
 */

import { z } from 'zod';
import {
  uuid,
  relationType,
  canvasPosition,
} from './shared';
import { buildPlanItemUpdateShape } from '../../../shared/planItemFieldSchemas';
import { planActionSchema } from '../../../shared/planActionSchema';

// =============================================================================
// Plan Item Updates Schema
// =============================================================================

/** Schema for plan item updates — generated from src/shared/planItemFields.ts */
const planItemUpdates = z
  .object(buildPlanItemUpdateShape('ipc'))
  .refine((u) => Object.keys(u).length > 0, 'At least one update field is required');

// =============================================================================
// Plan Action Schema
// =============================================================================

/** Schema for PlanAction — generated from src/shared/planActionSchema.ts */
export { planActionSchema };

// =============================================================================
// Plan Schemas
// =============================================================================

export const PlanSchemas = {
  listItems: z.object({
    projectId: uuid,
  }),

  executeActions: z.object({
    projectId: uuid,
    actions: z.array(planActionSchema).min(1, 'At least one action is required'),
  }),

  addRelation: z.object({
    project_id: uuid,
    from_item_id: uuid,
    to_item_id: uuid,
    relation_type: relationType,
  }),

  removeRelation: z.object({
    relationId: uuid,
  }),

  getRelations: z.object({
    projectId: uuid,
  }),

  updatePosition: z.object({
    itemId: uuid,
    x: canvasPosition,
    y: canvasPosition,
  }),

  updatePositions: z.object({
    updates: z.array(z.object({
      id: uuid,
      x: canvasPosition,
      y: canvasPosition,
    })).max(500),
  }),

  updateItem: z.object({
    itemId: uuid,
    updates: planItemUpdates,
  }),

  deleteItem: z.object({
    itemId: uuid,
  }),

  deleteItemWithDescendants: z.object({
    itemId: uuid,
  }),

  getChildCount: z.object({
    itemId: uuid,
  }),
};
