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
import { tool, jsonResult, toolError, toolLog } from './index';
import { StatusCategoryEnum, type PlanActionsCallback } from './schemas';

// Zod schemas matching the PlanAction type
const LabelEnum = z.enum(['project', 'story', 'feature', 'task']);
const RelationTypeEnum = z.enum(['depends_on', 'blocks', 'relates_to']);

const CreateItemAction = z.object({
  type: z.literal('create_item'),
  title: z.string(),
  description: z.string().optional().describe('Rationale / context. For the *contract* the agent executes, use intent + acceptance_criteria instead.'),
  intent: z
    .string()
    .max(500)
    .optional()
    .describe('One sentence: what this item commits to. The decided outcome, not the motivation.'),
  acceptance_criteria: z
    .array(z.string().min(1).max(1000))
    .max(50)
    .optional()
    .describe('Testable checklist the agent will satisfy. Each entry is one criterion. Omit when criteria cannot be enumerated upfront (exploratory or research items).'),
  source_document_id: z
    .string()
    .optional()
    .describe('ID of the iteration document this item was extracted from, if any. Preserves the breadcrumb back to discovery context.'),
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
    intent: z.string().max(500).optional(),
    acceptance_criteria: z
      .array(z.string().min(1).max(1000))
      .max(50)
      .optional()
      .describe('Replaces the full list. Fetch the current items first if you want to add/remove individual criteria.'),
    source_document_id: z.string().optional(),
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

// Group actions (visual containers). Shapes mirror `planActionSchema` in
// `src/main/ipc/validation/plan.ts` exactly — the executor (PlanActionService)
// already handles these, including `$1` placeholder resolution for a group
// created earlier in the same batch. Keep these in sync with that schema.
const CreateGroupAction = z.object({
  type: z.literal('create_group'),
  project_id: z.string(),
  name: z.string(),
  position_x: z.number(),
  position_y: z.number(),
  width: z.number(),
  height: z.number(),
});

const UpdateGroupAction = z.object({
  type: z.literal('update_group'),
  group_id: z.string(),
  updates: z.object({
    name: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  }),
});

const DeleteGroupAction = z.object({
  type: z.literal('delete_group'),
  group_id: z.string(),
});

const AssignToGroupAction = z.object({
  type: z.literal('assign_to_group'),
  item_id: z.string(),
  group_id: z.string().nullable(),
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
  CreateGroupAction,
  UpdateGroupAction,
  DeleteGroupAction,
  AssignToGroupAction,
]);

export type { PlanActionsCallback };

/**
 * Create the plan changes tool.
 *
 * @param onPlanActions - Callback to emit proposed actions to the UI for approval
 */
export function createPlanChangeTools(onPlanActions: PlanActionsCallback) {
  console.log('[KPM Tools] Creating modify_plan tool');

  return [
    tool(
      'modify_plan',
      `Modify the plan. KPM will either queue these changes for review or apply them immediately, depending on the user's approval setting.

Plan items carry structured fields that flow to the agent, the reviewer, and generated artifacts:
- **intent** (one sentence, local-only): what "done" means at a glance. The decided outcome.
- **acceptance_criteria** (string[], local-only): testable checklist the agent will satisfy. Each entry is one criterion.
- **description** (markdown, **synced to Jira/Linear**): rationale, context, rejected alternatives. Not the contract — the story.
- **source_document_id** (local-only): if this item was extracted from an iteration doc, carry the breadcrumb here.

Use intent + acceptance_criteria as the primary shape for implementation items. Use description for discovery/research items where criteria cannot be enumerated yet.

**Sync boundary — critical.** When an item has a Jira/Linear association, its \`description\` is pushed to the external tracker as-is. Keep description sync-clean:
- **Never** mention KPM document IDs (e.g., \`doc-42\`, \`source_document_id: ...\`) or other local-only resources inside description. Those references are dead outside the developer's machine.
- **Never** cite iteration-doc filenames or local project-folder paths unless they correspond to files actually in the synced code repo.
- Breadcrumbs to iteration docs live in the \`source_document_id\` field, never in prose.
- Code references (repo-relative paths like \`src/auth/session.ts\`) are fine in description — they exist wherever the code does.
- intent and acceptance_criteria are local-only and not synced today, so they can reference local context freely. Still, prefer self-contained phrasing so they survive if sync coverage expands later.

**Cross-item references — use \`@plan/<uuid>\`.** When an item's description, intent, or criteria mentions another plan item, write \`@plan/<uuid>\` instead of restating the title or guessing a tracker key. KPM rewrites these to native syntax on export (Jira smart link, Linear URL, GitHub \`Closes ENG-123\`), so refs are sync-safe by default and degrade to the item's title for unlinked items. Use only UUIDs from the **Item Reference** in the system prompt — KPM rejects unknown UUIDs at save. Refs do not work inside fenced code blocks.

Item actions:
- create_item: see full example below
- update_item: { "type": "update_item", "item_id": "...", "updates": { "status_category": "done" } }
  - update_item can also set intent, acceptance_criteria (replaces full list), description, etc.
- delete_item: { "type": "delete_item", "item_id": "..." }
- reparent: { "type": "reparent", "item_id": "...", "new_parent_id": "..." }
- add_dependency: { "type": "add_dependency", "from_id": "...", "to_id": "..." }

Group actions (visual containers):
- create_group: { "type": "create_group", "project_id": "...", "name": "Must Do", "position_x": 0, "position_y": 0, "width": 552, "height": 300 }
- assign_to_group: { "type": "assign_to_group", "item_id": "existing-uuid", "group_id": "$1" }
- update_group: { "type": "update_group", "group_id": "...", "updates": { "name": "New Name" } }
- delete_group: { "type": "delete_group", "group_id": "..." }

Placeholder references: Use $1, $2 etc. to reference entities created earlier in the same batch. Example: first action creates a group, $1 is that group's ID for subsequent assign_to_group actions.

Full create_item example (implementation item):
{
  "type": "create_item",
  "title": "Add session timeout warning modal",
  "intent": "Warn users before their session expires so they don't lose unsaved work.",
  "acceptance_criteria": [
    "Warning modal appears 5 minutes before session expires",
    "Modal exposes an Extend Session action that refreshes the token",
    "Warning does not interrupt active form input (e.g., typing in a textarea)",
    "Dismissing the modal still lets the session expire on schedule"
  ],
  "description": "Users report losing draft work when sessions time out silently. Rejected: auto-extending the session without asking — conflicts with session-fixation mitigations.",
  "parent_id": null
}

Exploratory item example (no criteria yet):
{
  "type": "create_item",
  "title": "Investigate storage budget for offline mode",
  "intent": "Decide whether IndexedDB is a viable target for offline plan caching.",
  "description": "Open question: are per-origin quotas predictable enough to rely on? Compare against OPFS.",
  "parent_id": null
}

Hierarchy rules:
- **Default \`parent_id: null\`.** Create items at root unless you have a concrete reason to nest.
- **Only nest when expanding a specific existing item** the user named or focused, AND you have resolved its ID via a query tool (\`query_plan_items\` with \`format: 'tree'\`, or \`get_plan_items\`). Never use a \`parent_id\` you didn't resolve from real data — placeholders ($1, $2) are fine when you create the parent in the same batch, but inventing IDs leaves orphaned references and corrupts the plan.
- **Do not create a parent item just to group siblings under it.** That's what Groups are for.

Groups vs hierarchy: Groups are visual containers (like Figma frames) — use them for organization without semantic weight ("these belong to the OAuth effort"). Hierarchy (\`parent_id\`) is for genuine parent/child relationships and **becomes a sub-task link on export to Jira/Linear** — so nesting is a semantic commitment, not a layout choice.

Example — capturing N items with optional grouping:
[
  { "type": "create_group", "project_id": "proj-1", "name": "OAuth migration", "position_x": 0, "position_y": 0, "width": 552, "height": 400 },
  { "type": "create_item", "title": "Audit existing token refresh flow", "parent_id": null },
  { "type": "create_item", "title": "Add PKCE support to authorize endpoint", "parent_id": null },
  { "type": "create_item", "title": "Migrate session store to Redis", "parent_id": null },
  { "type": "assign_to_group", "item_id": "$2", "group_id": "$1" },
  { "type": "assign_to_group", "item_id": "$3", "group_id": "$1" },
  { "type": "assign_to_group", "item_id": "$4", "group_id": "$1" }
]
All three items are root-level; the Group provides organization. Do not invent an "OAuth migration" parent item to nest them under.`,
      {
        message: z.string().describe('Brief description of the proposed changes'),
        actions: z.array(PlanActionSchema).describe('The plan actions to propose'),
      },
      async ({ message, actions }) => {
        toolLog(`[KPM Tools] modify_plan "${message}" (${actions.length} actions: ${actions.map(a => a.type).join(', ')})`);

        try {
          onPlanActions(actions);
        } catch (error) {
          console.error(`[KPM Tools] Error emitting actions:`, error);
          return toolError(`Failed to emit plan actions: ${error instanceof Error ? error.message : String(error)}`);
        }

        return jsonResult({
          success: true,
          message: 'Plan changes submitted to KPM.',
          actionCount: actions.length,
        });
      }
    ),
  ];
}
