/**
 * PlanAction schema registry.
 *
 * Each PlanAction variant is declared once here as a Zod object. The
 * discriminated union (`planActionSchema`) and the TS union (`PlanAction`,
 * re-exported from shared/types.ts) are both derived from this registry
 * instead of being hand-kept in sync across shared/types.ts and
 * main/ipc/validation/plan.ts.
 *
 * Lives in shared/ (not main/ipc/validation/) so main can consume it for
 * both IPC validation and PlanActionService dispatch without an
 * import edge from shared back into main.
 */

import { z } from 'zod';
import { planItemUpdatesType } from './planItemFieldSchemas';

const relationType = z.enum(['depends_on', 'blocks', 'relates_to']);
const canvasPosition = z.number().int().min(-10000).max(100000);
const planItemLabel = z.string().max(100, 'Label too long');
const nonEmptyString = (fieldName: string) => z.string().min(1, `${fieldName} cannot be empty`).trim();

/**
 * One entry per PlanAction type. Keyed by the literal `type` value so the
 * key and the schema's `type` literal can't drift from each other.
 */
export const PLAN_ACTION_REGISTRY = {
  create_item: z.object({
    type: z.literal('create_item'),
    title: nonEmptyString('Item title'),
    description: z.string().optional(),
    intent: z.string().max(500).optional(),
    acceptance_criteria: z.array(z.string().min(1).max(1000)).max(50).optional(),
    source_document_id: z.string().optional(),
    label: planItemLabel.optional(),
    parent_id: z.string().nullable(),
  }),
  reparent: z.object({
    type: z.literal('reparent'),
    item_id: z.string(),
    new_parent_id: z.string().nullable(),
  }),
  set_label: z.object({
    type: z.literal('set_label'),
    item_id: z.string(),
    label: z.string(),
  }),
  set_release: z.object({
    type: z.literal('set_release'),
    item_id: z.string(),
    release_tag: z.string().nullable(),
  }),
  add_dependency: z.object({
    type: z.literal('add_dependency'),
    from_id: z.string(),
    to_id: z.string(),
    relation_type: relationType,
  }),
  remove_dependency: z.object({
    type: z.literal('remove_dependency'),
    relation_id: z.string(),
  }),
  reorder: z.object({
    type: z.literal('reorder'),
    item_id: z.string(),
    after_item_id: z.string().nullable(),
  }),
  update_item: z.object({
    type: z.literal('update_item'),
    item_id: z.string(),
    updates: planItemUpdatesType('planAction'),
  }),
  delete_item: z.object({
    type: z.literal('delete_item'),
    item_id: z.string(),
  }),
  set_position: z.object({
    type: z.literal('set_position'),
    item_id: z.string(),
    x: canvasPosition,
    y: canvasPosition,
  }),
  queue_for_tracker: z.object({
    type: z.literal('queue_for_tracker'),
    item_ids: z.array(z.string()),
  }),
  create_group: z.object({
    type: z.literal('create_group'),
    project_id: z.string(),
    name: z.string(),
    position_x: z.number(),
    position_y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  update_group: z.object({
    type: z.literal('update_group'),
    group_id: z.string(),
    updates: z.object({
      name: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    }),
  }),
  delete_group: z.object({
    type: z.literal('delete_group'),
    group_id: z.string(),
  }),
  assign_to_group: z.object({
    type: z.literal('assign_to_group'),
    item_id: z.string(),
    group_id: z.string().nullable(),
  }),
} as const;

export type PlanActionType = keyof typeof PLAN_ACTION_REGISTRY;

const planActionVariants = Object.values(PLAN_ACTION_REGISTRY) as [
  (typeof PLAN_ACTION_REGISTRY)[PlanActionType],
  ...(typeof PLAN_ACTION_REGISTRY)[PlanActionType][],
];

/** Schema for PlanAction — derived from PLAN_ACTION_REGISTRY, not hand-kept in sync. */
export const planActionSchema = z.discriminatedUnion('type', planActionVariants);

export type PlanAction = z.infer<typeof planActionSchema>;
