/**
 * PlanAction schema registry.
 *
 * Each PlanAction variant is declared once here: its Zod object, which of its
 * fields hold entity ids, and whether it mints an id of its own. The
 * discriminated union (`planActionSchema`), the TS union (`PlanAction`,
 * re-exported from shared/types.ts), and placeholder resolution
 * (`planActionRefs.ts`) are all derived from this registry instead of being
 * hand-kept in sync.
 *
 * Lives in shared/ (not main/ipc/validation/) so main can consume it for
 * both IPC validation and PlanActionService dispatch without an
 * import edge from shared back into main.
 */

import { z } from 'zod';
import type { PlanActionRef, PlanActionRefKind } from './planActionRefs';
import { canvasPosition, planItemUpdatesType } from './planItemFieldSchemas';
import { connectedRepoIdSchema, repositoryScopeSchema, WORK_BRIEF_LIMITS, workBriefDraftSchema } from './workBrief';

const relationType = z.enum(['depends_on', 'blocks', 'relates_to']);
const planItemLabel = z.string().max(100, 'Label too long');
const nonEmptyString = (fieldName: string) => z.string().min(1, `${fieldName} cannot be empty`).trim();

/** Field names on the action that could hold an id. */
type IdField<Action> = {
  [K in keyof Action]-?: NonNullable<Action[K]> extends string | string[] ? K : never;
}[keyof Action] & string;

interface ActionEntry<Schema extends z.ZodObject<z.ZodRawShape>> {
  schema: Schema;
  refs: readonly PlanActionRef[];
  /** Set when the action creates an entity, claiming the batch's next `$N`. */
  creates?: PlanActionRefKind;
}

function action<Schema extends z.ZodObject<z.ZodRawShape>>(
  schema: Schema,
  spec: {
    refs?: readonly PlanActionRef<IdField<z.infer<Schema>>>[];
    creates?: PlanActionRefKind;
  } = {},
): ActionEntry<Schema> {
  return { schema, refs: spec.refs ?? [], creates: spec.creates };
}

const itemRef = <Field extends string>(field: Field): PlanActionRef<Field> =>
  ({ field, kind: 'planItem', placeholders: 'allowed' });
const groupRef = <Field extends string>(field: Field): PlanActionRef<Field> =>
  ({ field, kind: 'group', placeholders: 'allowed' });

/**
 * One entry per PlanAction type. Keyed by the literal `type` value so the
 * key and the schema's `type` literal can't drift from each other.
 */
export const PLAN_ACTION_REGISTRY = {
  create_item: action(z.object({
    type: z.literal('create_item'),
    title: nonEmptyString('Item title')
      .max(WORK_BRIEF_LIMITS.title)
      .describe('Concise title for the plan item'),
    description: z
      .string()
      .max(WORK_BRIEF_LIMITS.description)
      .optional()
      .describe('Rationale and context; synced to Jira or Linear when linked'),
    intent: z
      .string()
      .max(WORK_BRIEF_LIMITS.intent)
      .optional()
      .describe('One sentence describing the decided outcome'),
    acceptance_criteria: z
      .array(z.string().min(1).max(WORK_BRIEF_LIMITS.criterion))
      .max(WORK_BRIEF_LIMITS.criteria)
      .optional()
      .describe('Testable checklist the implementation must satisfy'),
    source_document_id: z.string().optional().describe('KPM document ID this item was extracted from, when applicable'),
    label: planItemLabel.optional().describe('Plan item type label'),
    parent_id: z.string().nullable().describe('Parent item ID, placeholder such as $1, or null for root'),
    primary_repo_id: connectedRepoIdSchema
      .nullable()
      .optional()
      .describe('Primary connected repo ID inferred from the current chat context, or null when ambiguous'),
    affected_repo_ids: z
      .array(connectedRepoIdSchema)
      .max(50)
      .optional()
      .describe('Other connected repo IDs this item is expected to affect; exclude primary_repo_id'),
  }), { refs: [itemRef('parent_id')], creates: 'planItem' }),
  reparent: action(z.object({
    type: z.literal('reparent'),
    item_id: z.string(),
    new_parent_id: z.string().nullable(),
  }), { refs: [itemRef('item_id'), itemRef('new_parent_id')] }),
  set_label: action(z.object({
    type: z.literal('set_label'),
    item_id: z.string(),
    label: z.string(),
  }), { refs: [itemRef('item_id')] }),
  set_release: action(z.object({
    type: z.literal('set_release'),
    item_id: z.string(),
    release_tag: z.string().nullable(),
  }), { refs: [itemRef('item_id')] }),
  add_dependency: action(z.object({
    type: z.literal('add_dependency'),
    from_id: z.string(),
    to_id: z.string(),
    relation_type: relationType,
  }), { refs: [itemRef('from_id'), itemRef('to_id')] }),
  remove_dependency: action(z.object({
    type: z.literal('remove_dependency'),
    relation_id: z.string(),
  }), { refs: [{ field: 'relation_id', kind: 'relation', placeholders: 'rejected' }] }),
  reorder: action(z.object({
    type: z.literal('reorder'),
    item_id: z.string(),
    after_item_id: z.string().nullable(),
  }), { refs: [itemRef('item_id'), itemRef('after_item_id')] }),
  update_item: action(z.object({
    type: z.literal('update_item'),
    item_id: z.string(),
    updates: planItemUpdatesType('planAction'),
  }), { refs: [itemRef('item_id')] }),
  revise_work_brief: action(z.object({
    type: z.literal('revise_work_brief'),
    item_id: z.string(),
    expected_revision: z.number().int().positive(),
    work_brief: workBriefDraftSchema,
  }), { refs: [itemRef('item_id')] }),
  set_repo_targets: action(z.object({
    type: z.literal('set_repo_targets'),
    item_id: z.string(),
    repository_scope: repositoryScopeSchema,
  }), { refs: [itemRef('item_id')] }),
  delete_item: action(z.object({
    type: z.literal('delete_item'),
    item_id: z.string(),
    /** Absent means orphan the descendants, matching the canvas delete dialog's default button. */
    cascade: z.boolean().optional(),
  }), { refs: [itemRef('item_id')] }),
  set_position: action(z.object({
    type: z.literal('set_position'),
    item_id: z.string(),
    x: canvasPosition,
    y: canvasPosition,
  }), { refs: [itemRef('item_id')] }),
  queue_for_tracker: action(z.object({
    type: z.literal('queue_for_tracker'),
    item_ids: z.array(z.string()),
  }), { refs: [itemRef('item_ids')] }),
  create_group: action(z.object({
    type: z.literal('create_group'),
    project_id: z.string(),
    name: z.string(),
    position_x: z.number(),
    position_y: z.number(),
    width: z.number(),
    height: z.number(),
  }), { creates: 'group' }),
  update_group: action(z.object({
    type: z.literal('update_group'),
    group_id: z.string(),
    updates: z.object({
      name: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    }),
  }), { refs: [groupRef('group_id')] }),
  delete_group: action(z.object({
    type: z.literal('delete_group'),
    group_id: z.string(),
  }), { refs: [groupRef('group_id')] }),
  assign_to_group: action(z.object({
    type: z.literal('assign_to_group'),
    item_id: z.string(),
    group_id: z.string().nullable(),
  }), { refs: [itemRef('item_id'), groupRef('group_id')] }),
} as const;

export type PlanActionType = keyof typeof PLAN_ACTION_REGISTRY;

const planActionVariants = Object.values(PLAN_ACTION_REGISTRY).map((entry) => entry.schema) as [
  (typeof PLAN_ACTION_REGISTRY)[PlanActionType]['schema'],
  ...(typeof PLAN_ACTION_REGISTRY)[PlanActionType]['schema'][],
];

/** Schema for PlanAction — derived from PLAN_ACTION_REGISTRY, not hand-kept in sync. */
export const planActionSchema = z.discriminatedUnion('type', planActionVariants);

export type PlanAction = z.infer<typeof planActionSchema>;

function collectRepoTargetIds(action: PlanAction): string[] {
  const repoIds = action.type === 'create_item'
    ? [action.primary_repo_id, ...(action.affected_repo_ids ?? [])]
    : action.type === 'set_repo_targets'
      ? [action.repository_scope.primary_repo_id, ...action.repository_scope.affected_repo_ids]
      : [];
  return repoIds.filter((repoId): repoId is string => Boolean(repoId));
}

/**
 * Targeted repo ids the project isn't connected to, deduplicated.
 *
 * Repo ids are references like the entity ids in `refs`, but they point at
 * rows outside the batch, so placeholder resolution has nothing to say about
 * them. Both the propose-time gate in the `modify_plan` tool and the
 * apply-time gate in `PlanActionService` ask here, because an action one
 * accepts and the other rejects aborts a whole batch after the turn ended.
 */
export function findUnconnectedRepoTargetIds(
  actions: PlanAction[],
  connectedRepoIds: ReadonlySet<string>,
): string[] {
  const targeted = new Set<string>();
  for (const action of actions) {
    for (const repoId of collectRepoTargetIds(action)) targeted.add(repoId);
  }
  return [...targeted].filter((repoId) => !connectedRepoIds.has(repoId));
}
