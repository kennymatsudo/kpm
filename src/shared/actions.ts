import { z } from 'zod';
import type { ClaudeModel } from './types';

/**
 * An Action is a saved prompt the user wrote, plus how it gets started and what
 * it is allowed to do. It replaces the split between Cmd+K custom prompts
 * (manual, global) and scheduled loops (interval, project-scoped): those were
 * the same object with different activation.
 */

export type ActionIcon = 'chart' | 'check' | 'document' | 'sparkles' | 'clipboard';

/** What the user picks before a manual run; the run is scoped to that entity. */
export type ActionTargetType = 'none' | 'document' | 'repo';

/** Where a manually invoked run happens. Automatic runs are always headless. */
export type ActionManualRun = 'chat' | 'headless';

export const ACTION_TRIGGER_EVENTS = [
  'app_opened',
  'board_agent_finished',
  'pr_changed',
  'ticket_changed',
  'branch_changed',
] as const;

export type ActionTriggerEvent = (typeof ACTION_TRIGGER_EVENTS)[number];

/**
 * How a run starts automatically. `manual` means it never does — the action
 * only runs when invoked. Manual invocation stays available under every kind.
 */
export type ActionTrigger =
  | { kind: 'manual' }
  | { kind: 'interval'; minutes: number }
  | { kind: 'event'; event: ActionTriggerEvent };

/**
 * What a run may do. This is the whole of what the old `output_mode` enum
 * encoded, split back into the two decisions it was carrying: what the run can
 * touch, and where its result lands. Delivery is a consequence of which grant
 * the run exercises, not a separate setting.
 */
export const ACTION_CAPABILITIES = [
  'read_project',
  'read_integrations',
  'report_finding',
  'write_outputs',
  'propose_documents',
  'propose_plan',
] as const;

export type ActionCapability = (typeof ACTION_CAPABILITIES)[number];

/**
 * Grants that produce something the user can see. An automatic trigger without
 * one of these would run on a schedule and leave no trace.
 */
export const ACTION_OUTPUT_CAPABILITIES = [
  'report_finding',
  'write_outputs',
  'propose_documents',
  'propose_plan',
] as const satisfies readonly ActionCapability[];

export type ActionOutputCapability = (typeof ACTION_OUTPUT_CAPABILITIES)[number];

/**
 * Grants whose writes go through review. An automatic run has no user present
 * to answer, so these depend on proposals being durable enough to survive until
 * the user is back.
 */
export const ACTION_PROPOSE_CAPABILITIES = [
  'propose_documents',
  'propose_plan',
] as const satisfies readonly ActionCapability[];

export type ActionRunOutcome = 'ok' | 'no_op' | 'error';

export interface ActionDefinition {
  id: string;
  name: string;
  description: string;
  /** Null means the action is available in every project. */
  projectId: string | null;
  prompt: string;
  icon: ActionIcon;
  /** Comma-separated palette search terms. */
  keywords: string;
  trigger: ActionTrigger;
  /** Gates automatic activation only; a manual run ignores it. */
  enabled: boolean;
  capabilities: ActionCapability[];
  manualRun: ActionManualRun;
  targetType: ActionTargetType;
  /**
   * Null follows the Claude model chosen in settings, resolved per run. Pinned
   * only when a run needs a specific one regardless of that choice.
   *
   * Deliberately narrower than the provider-aware `DefaultModel` playbook steps
   * follow: action runs go through the Claude path, so offering a provider here
   * would promise routing that does not exist yet.
   */
  model: ClaudeModel | null;
  /** Carried-forward state, so a run can tell what it already reported. */
  memory: string | null;
  lastRunAt: string | null;
  lastOutcome: ActionRunOutcome | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActionRun {
  id: string;
  actionId: string;
  outcome: ActionRunOutcome;
  summary: string | null;
  detail: string | null;
  error: string | null;
  /** Relative path to a file the run produced, when it wrote one. */
  artifactPath: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ActionValidationIssue {
  kind: 'field' | 'trigger' | 'capability' | 'summary';
  message: string;
  field?: string;
}

export const MIN_INTERVAL_MINUTES = 5;
export const MAX_INTERVAL_MINUTES = 10080;

export function isAutomatic(trigger: ActionTrigger): boolean {
  return trigger.kind !== 'manual';
}

export function hasOutputCapability(capabilities: ActionCapability[]): boolean {
  return capabilities.some((capability) =>
    (ACTION_OUTPUT_CAPABILITIES as readonly string[]).includes(capability)
  );
}

export function grantsProposals(capabilities: ActionCapability[]): boolean {
  return capabilities.some((capability) =>
    (ACTION_PROPOSE_CAPABILITIES as readonly string[]).includes(capability)
  );
}

const actionTriggerSchema: z.ZodType<ActionTrigger> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('manual') }).strict(),
  z.object({
    kind: z.literal('interval'),
    minutes: z.number().int().min(MIN_INTERVAL_MINUTES).max(MAX_INTERVAL_MINUTES),
  }).strict(),
  z.object({
    kind: z.literal('event'),
    event: z.enum(ACTION_TRIGGER_EVENTS),
  }).strict(),
]);

/**
 * The user-editable half of an action; ids and timestamps are owned by storage.
 * Split from `actionEditableSchema` so a partial update can be typed field-wise;
 * the cross-field rules only hold over a whole action, so a partial has to be
 * merged onto the stored one and re-checked (see `getActionValidationIssues`).
 */
export const actionFieldsSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  description: z.string().max(500).trim(),
  projectId: z.string().uuid().nullable(),
  prompt: z.string().min(1).max(50000),
  icon: z.enum(['chart', 'check', 'document', 'sparkles', 'clipboard']),
  keywords: z.string().max(500),
  trigger: actionTriggerSchema,
  enabled: z.boolean(),
  capabilities: z.array(z.enum(ACTION_CAPABILITIES)).max(ACTION_CAPABILITIES.length),
  manualRun: z.enum(['chat', 'headless']),
  targetType: z.enum(['none', 'document', 'repo']),
  model: z.enum(['opus', 'sonnet']).nullable(),
}).strict();

export const actionEditableSchema = actionFieldsSchema.superRefine(validateActionStructure);

export type ActionEditable = z.infer<typeof actionFieldsSchema>;

/** Strip the storage-owned fields so a stored action can be re-validated. */
export function toEditable(action: ActionDefinition): ActionEditable {
  return {
    name: action.name,
    description: action.description,
    projectId: action.projectId,
    prompt: action.prompt,
    icon: action.icon,
    keywords: action.keywords,
    trigger: action.trigger,
    enabled: action.enabled,
    capabilities: action.capabilities,
    manualRun: action.manualRun,
    targetType: action.targetType,
    model: action.model,
  };
}

function validateActionStructure(
  action: Omit<ActionEditable, never>,
  ctx: z.RefinementCtx
): void {
  const duplicates = action.capabilities.filter(
    (capability, index) => action.capabilities.indexOf(capability) !== index
  );
  for (const capability of new Set(duplicates)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['capabilities'],
      message: `Capability "${capability}" is granted more than once.`,
    });
  }

  if (isAutomatic(action.trigger) && !hasOutputCapability(action.capabilities)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['capabilities'],
      message:
        'A trigger needs at least one of: report a finding, write outputs, propose document edits, propose plan changes. Without one, each run leaves no trace.',
    });
  }

  // Temporary: an automatic run has no user present, and proposals do not yet
  // survive until one is. Remove this rule once they persist — the grant itself
  // is the intended replacement for the old `maintain` output mode.
  if (isAutomatic(action.trigger) && grantsProposals(action.capabilities)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['capabilities'],
      message:
        'A triggered action cannot propose changes yet — proposals are dropped when nobody is there to review them. Run this one manually for now.',
    });
  }

  // A headless run has no session for a proposal to surface in — the approval
  // queue is fed by a live chat session. A chat-mode run sends the prompt into a
  // real session, so it inherits the normal review flow.
  if (grantsProposals(action.capabilities) && action.manualRun !== 'chat') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['manualRun'],
      message: 'An action that proposes changes has to run in chat, where the changes can be reviewed.',
    });
  }

  if (isAutomatic(action.trigger) && action.targetType !== 'none') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetType'],
      message: 'A triggered action cannot ask for a target — nobody is there to pick one.',
    });
  }

  if (action.trigger.kind === 'event' && action.trigger.event === 'board_agent_finished' && action.projectId === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['projectId'],
      message: 'A board-agent trigger belongs to one project.',
    });
  }

  if (action.capabilities.includes('write_outputs') && action.projectId === null && isAutomatic(action.trigger)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['projectId'],
      message: 'Writing outputs on a trigger needs a project to write into.',
    });
  }
}

export function parseAction(input: unknown): ActionEditable {
  return actionEditableSchema.parse(input);
}

export function getActionValidationIssues(input: unknown): ActionValidationIssue[] {
  const result = actionEditableSchema.safeParse(input);
  if (result.success) return [];

  return result.error.issues.map((issue) => {
    const field = typeof issue.path[0] === 'string' ? issue.path[0] : undefined;
    return {
      kind: field === 'trigger' ? 'trigger' : field === 'capabilities' ? 'capability' : field ? 'field' : 'summary',
      message: issue.message,
      field,
    };
  });
}

/** User-facing label for a trigger, for the palette and settings list. */
export function formatTrigger(trigger: ActionTrigger): string {
  switch (trigger.kind) {
    case 'manual':
      return 'Manual';
    case 'interval':
      return formatInterval(trigger.minutes);
    case 'event':
      return TRIGGER_EVENT_LABELS[trigger.event];
  }
}

const TRIGGER_EVENT_LABELS: Record<ActionTriggerEvent, string> = {
  app_opened: 'On app open',
  board_agent_finished: 'When an agent finishes',
  pr_changed: 'On pull request activity',
  ticket_changed: 'On tracker change',
  branch_changed: 'On branch change',
};

function formatInterval(minutes: number): string {
  if (minutes < 60) return `Every ${minutes}m`;
  if (minutes < 1440) {
    const hours = minutes / 60;
    return Number.isInteger(hours) ? `Every ${hours}h` : `Every ${minutes}m`;
  }
  const days = minutes / 1440;
  return Number.isInteger(days) ? (days === 1 ? 'Daily' : `Every ${days}d`) : `Every ${minutes}m`;
}

export const ACTION_CAPABILITY_LABELS: Record<ActionCapability, string> = {
  read_project: 'Read project files, documents, and plan',
  read_integrations: 'Read Jira, Linear, GitHub, and Confluence',
  report_finding: 'Report a finding as a notification',
  write_outputs: 'Write result files to the outputs folder',
  propose_documents: 'Propose edits to project documents',
  propose_plan: 'Propose plan changes',
};
