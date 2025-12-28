/**
 * Plan Item and Plan Action Validation Schemas
 */

import { z } from 'zod';
import {
  uuid,
  nonEmptyString,
  planItemStatus,
  statusCategory,
  planItemLabel,
  relationType,
  canvasPosition,
} from './shared';

// =============================================================================
// Plan Item Updates Schema
// =============================================================================

/** Schema for plan item updates */
const planItemUpdates = z
  .object({
    title: z.string().min(1, 'Title cannot be empty').max(500, 'Title too long').trim().optional(),
    description: z.string().max(50000, 'Description too long').nullable().optional(),
    label: planItemLabel.nullable().optional(),
    status: planItemStatus.optional(),
    status_category: statusCategory.nullable().optional(),
    release_tag: z.string().max(50, 'Release tag too long').nullable().optional(),
    parent_id: uuid.nullable().optional(),
    item_order: z.number().int().min(0).optional(),
    code_refs: z.array(z.string()).nullable().optional(),
    position_x: canvasPosition.nullable().optional(),
    position_y: canvasPosition.nullable().optional(),
  })
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
    updates: z.object({
      title: z.string().optional(),
      description: z.string().nullable().optional(),
      label: z.string().nullable().optional(),
      release_tag: z.string().nullable().optional(),
      status_category: statusCategory.nullable().optional(),
    }),
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
