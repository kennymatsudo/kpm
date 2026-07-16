import { z } from 'zod';
import type { AgentEffortLevel } from './types';
import type { ReviewAxis } from './agent-types';

export type SessionKind = 'main' | 'subagent';
export type Directive =
  | { kind: 'prompt'; promptKey?: string; text?: string }
  | { kind: 'skill'; name: string; args?: string };

/** A concrete provider (and optionally model) choice for a playbook step. */
export interface ConcreteAgent {
  provider: string;
  model?: string;
  effort?: AgentEffortLevel;
}

/**
 * Follow the user's KPM model default (see `resolveDefaultModel`) instead of a
 * pinned provider+model. Resolved live at execution time, so the step tracks
 * whatever model the user has chosen in KPM.
 */
export interface DefaultAgent {
  useDefault: true;
  effort?: AgentEffortLevel;
}

export type AgentCandidate = ConcreteAgent | DefaultAgent;

export function isDefaultAgent(candidate: AgentCandidate): candidate is DefaultAgent {
  return 'useDefault' in candidate && candidate.useDefault === true;
}

export interface ModelDescriptor {
  id: string;
  name: string;
  isDefault?: boolean;
}

export interface BoardProvider {
  id: string;
  name: string;
  available: boolean;
  models: ModelDescriptor[];
  capabilities: {
    nativeSkills: boolean;
    reviewSandbox: boolean;
  };
  unavailableReason?: string;
}

/** Per-run overrides for a fan-out subagent step, aligned by index with `runs`. */
export interface PlaybookRunOverride {
  /** Review lens this run's findings are tagged with. */
  axis?: ReviewAxis;
  /** Prompt for this run, overriding the step's systemPromptKey. */
  systemPromptKey?: string;
}

export interface PlaybookStep {
  id: string;
  session: SessionKind;
  agents?: AgentCandidate[];
  runs?: AgentCandidate[][];
  runOverrides?: PlaybookRunOverride[];
  systemPromptKey?: string;
  writes?: true;
  directive: Directive;
  verdict?: 'findings';
  onFindings?: { goto: string; maxPasses: number; onMaxPasses: 'pause' | 'proceed' };
  next?: string;
  pauseBefore?: true;
}

export interface Playbook {
  id: string;
  name: string;
  builtIn: boolean;
  steps: PlaybookStep[];
}

export interface PlaybookValidationIssue {
  kind: 'step' | 'route' | 'output' | 'field' | 'summary';
  message: string;
  stepId?: string;
  field?: string;
  token?: string;
}

/** User-facing label for a persisted step id. Internal ids never belong in UI copy. */
export function formatPlaybookStepTitle(id: string): string {
  return id
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const effortSchema = z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional();
const concreteAgentSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1).optional(),
  effort: effortSchema,
}).strict();
const defaultAgentSchema = z.object({
  useDefault: z.literal(true),
  effort: effortSchema,
}).strict();
const agentCandidateSchema: z.ZodType<AgentCandidate> = z.union([concreteAgentSchema, defaultAgentSchema]);

const directiveSchema: z.ZodType<Directive> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('prompt'),
    promptKey: z.string().min(1).optional(),
    text: z.string().optional(),
  }).strict(),
  z.object({
    kind: z.literal('skill'),
    name: z.string().min(1),
    args: z.string().optional(),
  }).strict(),
]);

export const playbookStepSchema: z.ZodType<PlaybookStep> = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  session: z.enum(['main', 'subagent']),
  agents: z.array(agentCandidateSchema).min(1).optional(),
  runs: z.array(z.array(agentCandidateSchema).min(1)).min(1).optional(),
  runOverrides: z.array(z.object({
    axis: z.enum(['standards', 'spec', 'general']).optional(),
    systemPromptKey: z.string().min(1).optional(),
  }).strict()).optional(),
  systemPromptKey: z.string().min(1).optional(),
  writes: z.literal(true).optional(),
  directive: directiveSchema,
  verdict: z.literal('findings').optional(),
  onFindings: z.object({
    goto: z.string().min(1),
    maxPasses: z.number().int().positive().finite(),
    onMaxPasses: z.enum(['pause', 'proceed']),
  }).strict().optional(),
  next: z.string().min(1).optional(),
  pauseBefore: z.literal(true).optional(),
}).strict();

export const playbookSchema: z.ZodType<Playbook> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  builtIn: z.boolean(),
  steps: z.array(playbookStepSchema).min(1),
}).strict().superRefine((playbook, ctx) => {
  validatePlaybookStructure(playbook, (path, message) => {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  });
});

function outputReferences(step: PlaybookStep): string[] {
  const texts: string[] = [];
  if (step.directive.kind === 'prompt') {
    if (step.directive.text) texts.push(step.directive.text);
  } else if (step.directive.args) {
    texts.push(step.directive.args);
  }
  const refs: string[] = [];
  const pattern = /\{\{output:([^{}]+)\}\}/g;
  for (const text of texts) {
    for (const match of text.matchAll(pattern)) {
      refs.push(match[1]);
    }
  }
  return refs;
}

function defaultNext(steps: PlaybookStep[], index: number): string | undefined {
  return steps[index].next ?? steps[index + 1]?.id;
}

interface StepEdge { target: string; field: 'next' | 'onFindings' | 'implicit' }

function stepEdgeEntries(steps: PlaybookStep[], index: number): StepEdge[] {
  const step = steps[index];
  const edges = new Map<string, StepEdge>();
  // A routed findings verdict terminates when clean unless the user explicitly
  // supplies `next`. This is what lets an address step sit immediately after a
  // review while remaining reachable only through `onFindings.goto`.
  const next = step.verdict === 'findings' && step.onFindings && !step.next
    ? undefined
    : defaultNext(steps, index);
  if (next) edges.set(next, { target: next, field: step.next ? 'next' : 'implicit' });
  if (step.onFindings) edges.set(step.onFindings.goto, { target: step.onFindings.goto, field: 'onFindings' });
  return [...edges.values()];
}

function stepEdges(steps: PlaybookStep[], index: number): string[] {
  return stepEdgeEntries(steps, index).map((edge) => edge.target);
}

function validatePlaybookStructure(
  playbook: Playbook,
  addIssue: (path: (string | number)[], message: string) => void,
): void {
  const steps = playbook.steps;
  const idToIndex = new Map<string, number>();
  steps.forEach((step, index) => {
    if (idToIndex.has(step.id)) {
      addIssue(['steps', index, 'id'], `Duplicate step id: ${step.id}`);
    }
    idToIndex.set(step.id, index);
  });

  let firstMainIndex = -1;
  steps.forEach((step, index) => {
    const isFirstMain = step.session === 'main' && firstMainIndex === -1;
    if (isFirstMain) firstMainIndex = index;

    if (step.agents && step.runs) {
      addIssue(['steps', index, 'runs'], 'runs is exclusive with agents');
    }
    if (step.onFindings && step.verdict !== 'findings') {
      addIssue(['steps', index, 'onFindings'], 'onFindings requires verdict: findings');
    }
    if (step.runs && step.session !== 'subagent') {
      addIssue(['steps', index, 'runs'], 'runs is allowed only on subagent steps');
    }
    if (step.runOverrides && !step.runs) {
      addIssue(['steps', index, 'runOverrides'], 'runOverrides requires runs');
    }
    if (step.runOverrides && step.runs && step.runOverrides.length > step.runs.length) {
      addIssue(['steps', index, 'runOverrides'], 'runOverrides has more entries than runs');
    }
    if (step.writes && (step.session !== 'subagent' || step.runs)) {
      addIssue(['steps', index, 'writes'], 'writes is allowed only on single-run subagent steps');
    }
    if (step.session === 'main' && !isFirstMain && step.systemPromptKey) {
      addIssue(['steps', index, 'systemPromptKey'], 'systemPromptKey is allowed only on subagent steps and the first main step');
    }
    if (step.session === 'main' && !isFirstMain && step.agents) {
      addIssue(['steps', index, 'agents'], 'agents is allowed only on subagent steps and the first main step');
    }
    if (step.session === 'subagent' && !step.systemPromptKey) {
      addIssue(['steps', index, 'systemPromptKey'], 'subagent steps require systemPromptKey');
    }
    if (step.session === 'subagent' && !step.agents && !step.runs) {
      addIssue(['steps', index, 'agents'], 'subagent steps require agents or runs');
    }

    for (const [field, target] of [['next', step.next], ['onFindings.goto', step.onFindings?.goto]] as const) {
      if (target && !idToIndex.has(target)) {
        addIssue(['steps', index, ...field.split('.')], `Unknown target step: ${target}`);
      }
    }

    for (const ref of outputReferences(step)) {
      const refIndex = idToIndex.get(ref);
      if (refIndex == null) {
        addIssue(['steps', index, 'directive'], `Unknown output reference: ${ref}`);
      } else if (refIndex >= index) {
        addIssue(['steps', index, 'directive'], `Output reference must point to an earlier step: ${ref}`);
      }
    }
  });

  if (firstMainIndex === -1) {
    addIssue(['steps'], 'playbook must include a main step');
  } else if (!steps[firstMainIndex].systemPromptKey) {
    addIssue(['steps', firstMainIndex, 'systemPromptKey'], 'first main step requires systemPromptKey');
  }

  const reachable = new Set<string>();
  const visitReachable = (stepId: string) => {
    if (reachable.has(stepId)) return;
    const index = idToIndex.get(stepId);
    if (index == null) return;
    reachable.add(stepId);
    for (const edge of stepEdges(steps, index)) visitReachable(edge);
  };
  visitReachable(steps[0].id);
  steps.forEach((step, index) => {
    if (!reachable.has(step.id)) {
      addIssue(['steps', index], `Unreachable step: ${step.id}`);
    }
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const dfs = (stepId: string, sourceIndex?: number, sourceField?: StepEdge['field']) => {
    if (visiting.has(stepId)) {
      const cycle = stack.slice(stack.indexOf(stepId));
      const bounded = cycle.some((id) => {
        const step = steps[idToIndex.get(id)!];
        return step.onFindings?.maxPasses != null;
      });
      if (!bounded) {
        const path = sourceIndex == null
          ? ['steps']
          : sourceField === 'onFindings'
            ? ['steps', sourceIndex, 'onFindings', 'goto']
            : sourceField === 'next'
              ? ['steps', sourceIndex, 'next']
              : ['steps', sourceIndex];
        addIssue(path, `Cycle must pass through a step with onFindings.maxPasses: ${cycle.join(' -> ')}`);
      }
      return;
    }
    if (visited.has(stepId)) return;
    visiting.add(stepId);
    stack.push(stepId);
    const index = idToIndex.get(stepId);
    if (index != null) {
      for (const edge of stepEdgeEntries(steps, index)) dfs(edge.target, index, edge.field);
    }
    stack.pop();
    visiting.delete(stepId);
    visited.add(stepId);
  };
  dfs(steps[0].id);
}

export function parsePlaybook(input: unknown): Playbook {
  return playbookSchema.parse(input);
}

/** Convert schema failures into editor anchors without exposing Zod paths to React. */
export function getPlaybookValidationIssues(input: unknown): PlaybookValidationIssue[] {
  const result = playbookSchema.safeParse(input);
  if (result.success) return [];
  const playbook = input && typeof input === 'object' ? input as Partial<Playbook> : null;
  return result.error.issues.map((issue) => {
    const stepIndex = issue.path[0] === 'steps' && typeof issue.path[1] === 'number'
      ? issue.path[1]
      : undefined;
    const stepId = stepIndex == null ? undefined : playbook?.steps?.[stepIndex]?.id;
    const path = issue.path.slice(2).join('.');
    const outputRef = /(?:Unknown output reference|earlier step): (\S+)/.exec(issue.message)?.[1];
    if (outputRef && stepId) {
      return { kind: 'output', stepId, field: 'directive', token: `{{output:${outputRef}}}`, message: issue.message };
    }
    if (stepId && (path === 'next' || path.startsWith('onFindings'))) {
      return { kind: 'route', stepId, field: path.startsWith('onFindings') ? 'onFindings' : 'next', message: issue.message };
    }
    if (stepId && issue.message.startsWith('Unreachable step:')) {
      return { kind: 'step', stepId, message: issue.message };
    }
    if (stepId) return { kind: 'field', stepId, field: path || undefined, message: issue.message };
    return { kind: 'summary', message: issue.message };
  });
}

export interface PlaybookLoop {
  startIndex: number;
  endIndex: number;
  maxPasses: number;
  onMaxPasses: 'pause' | 'proceed';
}

/** Contiguous step spans that flow loops back through, for grouping in the editor. */
export function getPlaybookLoops(playbook: Playbook): PlaybookLoop[] {
  const steps = playbook.steps;
  const idToIndex = new Map(steps.map((step, index) => [step.id, index] as const));
  const byStart = new Map<number, PlaybookLoop>();
  steps.forEach((_step, sourceIndex) => {
    for (const edge of stepEdgeEntries(steps, sourceIndex)) {
      const targetIndex = idToIndex.get(edge.target);
      if (targetIndex == null || targetIndex > sourceIndex) continue;
      let maxPasses = 1;
      let onMaxPasses: 'pause' | 'proceed' = 'pause';
      for (let index = targetIndex; index <= sourceIndex; index += 1) {
        const findings = steps[index].onFindings;
        if (findings) {
          maxPasses = findings.maxPasses;
          onMaxPasses = findings.onMaxPasses;
          break;
        }
      }
      const existing = byStart.get(targetIndex);
      if (!existing || sourceIndex > existing.endIndex) {
        byStart.set(targetIndex, { startIndex: targetIndex, endIndex: sourceIndex, maxPasses, onMaxPasses });
      }
    }
  });
  return [...byStart.values()].sort((a, b) => a.startIndex - b.startIndex);
}

export const BUILT_IN_PLAYBOOKS = {
  implementOnly: parsePlaybook({
    id: 'builtin.implement_only',
    name: 'Implement (no review)',
    builtIn: true,
    steps: [
      {
        id: 'implement',
        session: 'main',
        agents: [{ useDefault: true }, { provider: 'claude' }],
        systemPromptKey: 'agents.implementation_system',
        directive: { kind: 'prompt' },
      },
    ],
  }),
  implementOpposingReview: parsePlaybook({
    id: 'builtin.implement_opposing_review',
    name: 'Implement + review',
    builtIn: true,
    steps: [
      {
        id: 'implement',
        session: 'main',
        agents: [{ useDefault: true }, { provider: 'claude' }],
        systemPromptKey: 'agents.implementation_system',
        directive: { kind: 'prompt' },
      },
      {
        id: 'review',
        session: 'subagent',
        agents: [{ provider: 'codex' }, { provider: 'gemini' }],
        systemPromptKey: 'agents.review_system',
        directive: { kind: 'prompt' },
        verdict: 'findings',
        onFindings: { goto: 'address', maxPasses: 1, onMaxPasses: 'proceed' },
      },
      {
        id: 'address',
        session: 'main',
        directive: { kind: 'prompt', promptKey: 'agents.review_assessment' },
      },
    ],
  }),
  implementCodeReview: parsePlaybook({
    id: 'builtin.implement_code_review',
    name: 'Implement test-first + deep review',
    builtIn: true,
    steps: [
      {
        id: 'implement',
        session: 'main',
        agents: [{ useDefault: true }, { provider: 'claude' }],
        systemPromptKey: 'agents.implementation_tdd_system',
        directive: { kind: 'prompt' },
      },
      {
        id: 'review',
        session: 'subagent',
        runs: [
          [{ provider: 'codex' }, { provider: 'gemini' }],
          [{ provider: 'codex' }, { provider: 'gemini' }],
        ],
        systemPromptKey: 'agents.code_review_standards',
        runOverrides: [
          { axis: 'standards' },
          { axis: 'spec', systemPromptKey: 'agents.code_review_spec' },
        ],
        directive: { kind: 'prompt' },
        verdict: 'findings',
        onFindings: { goto: 'address', maxPasses: 3, onMaxPasses: 'pause' },
      },
      {
        id: 'address',
        session: 'main',
        directive: { kind: 'prompt', promptKey: 'agents.review_assessment' },
        next: 'review',
      },
    ],
  }),
} as const;

/** The playbook a fresh install defaults to before the user chooses one. */
export const DEFAULT_PLAYBOOK = BUILT_IN_PLAYBOOKS.implementOnly;
