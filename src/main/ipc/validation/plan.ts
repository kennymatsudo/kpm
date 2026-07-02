/**
 * Plan Item and Plan Action Validation Schemas
 */

import { z } from 'zod';
import {
  uuid,
  nonEmptyString,
  planItemLabel,
  relationType,
  canvasPosition,
} from './shared';
import { buildPlanItemUpdateShape } from './planItemFieldSchemas';

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

/** Schema for PlanAction - matches the union type in shared/types.ts */
export const planActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create_item'),
    title: nonEmptyString('Item title'),
    description: z.string().optional(),
    intent: z.string().max(500).optional(),
    acceptance_criteria: z.array(z.string().min(1).max(1000)).max(50).optional(),
    source_document_id: z.string().optional(),
    label: planItemLabel.optional(),
    parent_id: z.string().nullable(),
  }),
  z.object({
    type: z.literal('reparent'),
    item_id: z.string(),
    new_parent_id: z.string().nullable(),
  }),
  z.object({
    type: z.literal('set_label'),
    item_id: z.string(),
    label: z.string(),
  }),
  z.object({
    type: z.literal('set_release'),
    item_id: z.string(),
    release_tag: z.string().nullable(),
  }),
  z.object({
    type: z.literal('add_dependency'),
    from_id: z.string(),
    to_id: z.string(),
    relation_type: relationType,
  }),
  z.object({
    type: z.literal('remove_dependency'),
    relation_id: z.string(),
  }),
  z.object({
    type: z.literal('reorder'),
    item_id: z.string(),
    after_item_id: z.string().nullable(),
  }),
  z.object({
    type: z.literal('update_item'),
    item_id: z.string(),
    updates: z.object(buildPlanItemUpdateShape('planAction')),
  }),
  z.object({
    type: z.literal('delete_item'),
    item_id: z.string(),
  }),
  z.object({
    type: z.literal('set_position'),
    item_id: z.string(),
    x: canvasPosition,
    y: canvasPosition,
  }),
  z.object({
    type: z.literal('queue_for_tracker'),
    item_ids: z.array(z.string()),
  }),
  // Group actions (visual containers)
  z.object({
    type: z.literal('create_group'),
    project_id: z.string(),
    name: z.string(),
    position_x: z.number(),
    position_y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  z.object({
    type: z.literal('update_group'),
    group_id: z.string(),
    updates: z.object({
      name: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    }),
  }),
  z.object({
    type: z.literal('delete_group'),
    group_id: z.string(),
  }),
  z.object({
    type: z.literal('assign_to_group'),
    item_id: z.string(),
    group_id: z.string().nullable(),
  }),
]);

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
