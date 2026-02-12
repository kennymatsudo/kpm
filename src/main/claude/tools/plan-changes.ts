/* eslint-disable @typescript-eslint/require-await */
/**
 * Plan Changes Tool
 *
 * Allows Claude to propose plan modifications via a structured tool call
 * instead of text-based plan-actions blocks.
 *
 * Note: Tool handlers are declared async per SDK requirements, though most don't await.
 */

import { z } from 'zod';

// Zod schemas matching the PlanAction type
const LabelEnum = z.enum(['project', 'story', 'feature', 'task']);
const RelationTypeEnum = z.enum(['depends_on', 'blocks', 'relates_to']);

const CreateItemAction = z.object({
  type: z.literal('create_item'),
  title: z.string(),
  label: LabelEnum.optional(),
  parent_id: z.string().nullable().describe('Parent item ID, placeholder ($1, $2), or null for root'),
});

const ReparentAction = z.object({
  type: z.literal('reparent'),
  item_id: z.string(),
  new_parent_id: z.string().nullable(),
});

const SetLabelAction = z.object({
  type: z.literal('set_label'),
  item_id: z.string(),
  label: z.string(),
});

const SetReleaseAction = z.object({
  type: z.literal('set_release'),
  item_id: z.string(),
  release_tag: z.string().nullable(),
});

const AddDependencyAction = z.object({
  type: z.literal('add_dependency'),
  from_id: z.string(),
  to_id: z.string(),
  relation_type: RelationTypeEnum,
});

const RemoveDependencyAction = z.object({
  type: z.literal('remove_dependency'),
  relation_id: z.string(),
});

const ReorderAction = z.object({
  type: z.literal('reorder'),
  item_id: z.string(),
  after_item_id: z.string().nullable(),
});

const UpdateItemAction = z.object({
  type: z.literal('update_item'),
  item_id: z.string(),
  updates: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    label: LabelEnum.optional(),
    release_tag: z.string().optional(),
    status_category: StatusCategoryEnum.optional(),
  }),
});

const DeleteItemAction = z.object({
  type: z.literal('delete_item'),
  item_id: z.string(),
});

const SetPositionAction = z.object({
  type: z.literal('set_position'),
  item_id: z.string(),
  x: z.number(),
  y: z.number(),
});

const QueueForTrackerAction = z.object({
  type: z.literal('queue_for_tracker'),
  item_ids: z.array(z.string()),
});

// Union of all action types
const PlanActionSchema = z.discriminatedUnion('type', [
  CreateItemAction,
  ReparentAction,
  SetLabelAction,
  SetReleaseAction,
  AddDependencyAction,
  RemoveDependencyAction,
  ReorderAction,
  UpdateItemAction,
  DeleteItemAction,
  SetPositionAction,
  QueueForTrackerAction,
]);


/**
 * Create the plan changes tool.
 *
 * @param onPlanActions - Callback to emit proposed actions to the UI for approval
 */
export function createPlanChangeTools(onPlanActions: PlanActionsCallback) {

  return [
    tool(
      'modify_plan',


Item actions:
- update_item: { "type": "update_item", "item_id": "...", "updates": { "status_category": "done" } }
- delete_item: { "type": "delete_item", "item_id": "..." }
- reparent: { "type": "reparent", "item_id": "...", "new_parent_id": "..." }
- add_dependency: { "type": "add_dependency", "from_id": "...", "to_id": "..." }

Group actions (visual containers):
- assign_to_group: { "type": "assign_to_group", "item_id": "existing-uuid", "group_id": "$1" }
- update_group: { "type": "update_group", "group_id": "...", "updates": { "name": "New Name" } }
- delete_group: { "type": "delete_group", "group_id": "..." }

Placeholder references: Use $1, $2 etc. to reference entities created earlier in the same batch. Example: first action creates a group, $1 is that group's ID for subsequent assign_to_group actions.


      {
        message: z.string().describe('Brief description of the proposed changes'),
        actions: z.array(PlanActionSchema).describe('The plan actions to propose'),
      },
      async ({ message, actions }) => {

        try {
        } catch (error) {
          return toolError(`Failed to emit plan actions: ${error instanceof Error ? error.message : String(error)}`);
        }

          success: true,
          actionCount: actions.length,
      }
    ),
  ];
}
