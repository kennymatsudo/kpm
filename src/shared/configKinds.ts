/**
 * Configuration kinds chat may propose changes to.
 *
 * Each entry holds the kind's pure contract: how to validate a proposed
 * payload, how to fingerprint a stored record for the stale check, and how to
 * describe a change for the approval panel. Reading records (main process) and
 * applying an approved change (renderer) are keyed by `ConfigKind` in their own
 * layers, so a new kind that skips either is a compile error.
 *
 * Config proposals always queue for review, whatever the auto-apply setting
 * (P8): a playbook decides which agents run and whether they may write.
 */

import { getPlaybookValidationIssues, type PlaybookStep } from './playbooks';

export const CONFIG_KINDS = ['playbook'] as const;
export type ConfigKind = typeof CONFIG_KINDS[number];

export type ConfigOp = 'create' | 'update';

/** The part of a playbook a proposal may set. Id and built-in flag stay KPM's. */
export interface PlaybookConfigPayload {
  name: string;
  steps: PlaybookStep[];
}

export interface ConfigPayloads {
  playbook: PlaybookConfigPayload;
}

export type ConfigChange = {
  [K in ConfigKind]: {
    kind: K;
    op: ConfigOp;
    /** Record being updated; absent on create. */
    targetId?: string;
    /** Version of the record the proposal was based on; checked at apply time. */
    baseVersion?: string;
    before: ConfigPayloads[K] | null;
    after: ConfigPayloads[K];
  };
}[ConfigKind];

/** What a validator may check a payload against beyond its own structure. */
export interface ConfigValidationContext {
  providerIds?: readonly string[];
  promptKeys?: readonly string[];
}

/** One line of the approval panel's change list. */
export type ConfigDiffEntry =
  | { kind: 'renamed'; before: string; after: string }
  | { kind: 'step-added'; stepId: string; summary: string }
  | { kind: 'step-removed'; stepId: string; summary: string }
  | { kind: 'step-changed'; stepId: string; changes: ConfigFieldChange[] }
  | { kind: 'reordered'; before: string[]; after: string[] };

export type ConfigFieldChange =
  | { field: string; label: string; format: 'value'; before: string | null; after: string | null }
  | { field: string; label: string; format: 'text'; before: string; after: string };

interface ConfigKindDefinition<Payload> {
  label: string;
  /** Shown on the approval panel so the user knows how far a change reaches. */
  scopeNote: string;
  /** Messages the model can act on; empty when the payload is valid. */
  validate: (payload: unknown, context?: ConfigValidationContext) => string[];
  version: (payload: Payload) => string;
  displayName: (payload: Payload) => string;
  diff: (before: Payload | null, after: Payload) => ConfigDiffEntry[];
}

// Mirrors the playbook IPC endpoint limits, so a proposal that passes here
// cannot fail validation when the user approves it.
const MAX_PLAYBOOK_NAME = 120;
const MAX_PLAYBOOK_STEPS = 50;

export const CONFIG_KIND_REGISTRY = {
  playbook: {
    label: 'Playbook',
    scopeNote: 'Applies to all projects',
    validate: validatePlaybookPayload,
    version: (payload) => configVersion({ name: payload.name.trim(), steps: payload.steps }),
    displayName: (payload) => payload.name,
    diff: diffPlaybooks,
  },
} satisfies { [K in ConfigKind]: ConfigKindDefinition<ConfigPayloads[K]> };

export function describeConfigChange(change: ConfigChange): ConfigDiffEntry[] {
  return CONFIG_KIND_REGISTRY[change.kind].diff(change.before, change.after);
}

// ---------------------------------------------------------------------------
// Version token
// ---------------------------------------------------------------------------

/**
 * Short fingerprint of a stored definition. Keys are sorted first, so the same
 * record read twice gives the same token regardless of JSON key order. It only
 * detects edits between propose and apply; it is not a security boundary.
 */
export function configVersion(value: unknown): string {
  return cyrb53(stableStringify(value)).toString(16).padStart(14, '0');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function cyrb53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// ---------------------------------------------------------------------------
// Playbook
// ---------------------------------------------------------------------------

function validatePlaybookPayload(input: unknown, context: ConfigValidationContext = {}): string[] {
  if (!input || typeof input !== 'object') return ['payload must be an object with name and steps'];
  const payload = input as Partial<PlaybookConfigPayload>;
  const messages: string[] = [];

  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!name) messages.push('name is required');
  if (name.length > MAX_PLAYBOOK_NAME) messages.push(`name must be at most ${MAX_PLAYBOOK_NAME} characters`);
  if (Array.isArray(payload.steps) && payload.steps.length > MAX_PLAYBOOK_STEPS) {
    messages.push(`a playbook can have at most ${MAX_PLAYBOOK_STEPS} steps`);
  }

  const issues = getPlaybookValidationIssues({ id: 'proposed', name: name || 'proposed', builtIn: false, steps: payload.steps });
  for (const issue of issues) {
    const where = issue.stepId ? `step "${issue.stepId}"${issue.field ? ` (${issue.field})` : ''}: ` : '';
    messages.push(`${where}${issue.message}`);
  }
  if (issues.length > 0 || !Array.isArray(payload.steps)) return messages;

  // Structure is valid from here, so steps can be read as typed.
  const providers = context.providerIds ? new Set(context.providerIds) : null;
  const promptKeys = context.promptKeys ? new Set(context.promptKeys) : null;
  for (const step of payload.steps) {
    const where = `step "${step.id}"`;
    if (step.directive.kind === 'skill') {
      messages.push(`${where}: skill directives are not supported; put the instructions in directive.text`);
    }
    if (providers) {
      const candidates = [...(step.agents ?? []), ...(step.runs ?? []).flat()];
      for (const candidate of candidates) {
        if ('provider' in candidate && !providers.has(candidate.provider)) {
          messages.push(`${where}: unknown provider "${candidate.provider}"`);
        }
      }
    }
    if (promptKeys) {
      const keys = [
        step.systemPromptKey,
        step.directive.kind === 'prompt' ? step.directive.promptKey : undefined,
        ...(step.runOverrides ?? []).map((override) => override.systemPromptKey),
      ];
      for (const key of keys) {
        if (key && !promptKeys.has(key)) messages.push(`${where}: unknown prompt key "${key}"`);
      }
    }
  }
  return messages;
}

/** One-line description of a step for added/removed rows. */
export function summarizePlaybookStep(step: PlaybookStep): string {
  const role = step.session === 'main' ? 'Main session' : step.runs ? `${step.runs.length} parallel subagents` : 'Subagent';
  const parts = [role, directiveLabel(step)];
  if (step.verdict === 'findings') parts.push('returns findings');
  if (step.onFindings) parts.push(`on findings go to ${step.onFindings.goto}`);
  if (step.next) parts.push(`then ${step.next}`);
  if (step.pauseBefore) parts.push('waits for approval first');
  return parts.join(', ');
}

function directiveLabel(step: PlaybookStep): string {
  const directive = step.directive;
  if (directive.kind === 'skill') return `skill ${directive.name}`;
  if (directive.promptKey) return `prompt ${directive.promptKey}`;
  return directive.text?.trim() ? 'inline instructions' : 'task only';
}

function agentsLabel(candidates: PlaybookStep['agents']): string | null {
  if (!candidates) return null;
  return candidates
    .map((candidate) => {
      const effort = candidate.effort ? ` (${candidate.effort})` : '';
      if ('useDefault' in candidate) return `KPM default${effort}`;
      return `${candidate.provider}${candidate.model ? ` ${candidate.model}` : ''}${effort}`;
    })
    .join(', then ');
}

function onFindingsLabel(step: PlaybookStep): string | null {
  const route = step.onFindings;
  if (!route) return null;
  const stall = route.onStall ? `, ${route.onStall} on stall` : '';
  return `go to ${route.goto}, max ${route.maxPasses} ${route.maxPasses === 1 ? 'pass' : 'passes'}, then ${route.onMaxPasses}${stall}`;
}

function valueOrNull(value: string | null | undefined): string | null {
  return value == null || value === '' ? null : value;
}

function diffStep(before: PlaybookStep, after: PlaybookStep): ConfigFieldChange[] {
  const changes: ConfigFieldChange[] = [];
  const value = (field: string, label: string, a: string | null | undefined, b: string | null | undefined) => {
    const left = valueOrNull(a);
    const right = valueOrNull(b);
    if (left !== right) changes.push({ field, label, format: 'value', before: left, after: right });
  };
  const runsLabel = (step: PlaybookStep) => step.runs?.map((run, index) => {
    const override = step.runOverrides?.[index];
    const extras = [override?.axis, override?.systemPromptKey].filter(Boolean).join(', ');
    return `${agentsLabel(run)}${extras ? ` [${extras}]` : ''}`;
  }).join(' | ');

  value('session', 'Runs as', before.session, after.session);
  value('agents', 'Agents', agentsLabel(before.agents), agentsLabel(after.agents));
  value('runs', 'Parallel runs', runsLabel(before), runsLabel(after));
  value('systemPromptKey', 'Role instructions', before.systemPromptKey, after.systemPromptKey);
  value('directive.kind', 'Task', directiveLabel(before), directiveLabel(after));
  const beforeText = before.directive.kind === 'prompt' ? before.directive.text ?? '' : before.directive.args ?? '';
  const afterText = after.directive.kind === 'prompt' ? after.directive.text ?? '' : after.directive.args ?? '';
  if (beforeText !== afterText) {
    changes.push({ field: 'directive.text', label: 'Instructions', format: 'text', before: beforeText, after: afterText });
  }
  value('verdict', 'Findings check', before.verdict ? 'returns findings' : null, after.verdict ? 'returns findings' : null);
  value('onFindings', 'On findings', onFindingsLabel(before), onFindingsLabel(after));
  value('next', 'Then', before.next, after.next);
  value('writes', 'Can edit files', before.writes ? 'yes' : null, after.writes ? 'yes' : null);
  value('pauseBefore', 'Waits for approval first', before.pauseBefore ? 'yes' : null, after.pauseBefore ? 'yes' : null);
  return changes;
}

export function diffPlaybooks(before: PlaybookConfigPayload | null, after: PlaybookConfigPayload): ConfigDiffEntry[] {
  if (!before) {
    return after.steps.map((step) => ({ kind: 'step-added', stepId: step.id, summary: summarizePlaybookStep(step) }));
  }
  const entries: ConfigDiffEntry[] = [];
  if (before.name.trim() !== after.name.trim()) {
    entries.push({ kind: 'renamed', before: before.name, after: after.name });
  }
  const beforeById = new Map(before.steps.map((step) => [step.id, step] as const));
  const afterIds = new Set(after.steps.map((step) => step.id));

  for (const step of before.steps) {
    if (!afterIds.has(step.id)) entries.push({ kind: 'step-removed', stepId: step.id, summary: summarizePlaybookStep(step) });
  }
  for (const step of after.steps) {
    const previous = beforeById.get(step.id);
    if (!previous) {
      entries.push({ kind: 'step-added', stepId: step.id, summary: summarizePlaybookStep(step) });
      continue;
    }
    const changes = diffStep(previous, step);
    if (changes.length > 0) entries.push({ kind: 'step-changed', stepId: step.id, changes });
  }

  const keptBefore = before.steps.map((step) => step.id).filter((id) => afterIds.has(id));
  const keptAfter = after.steps.map((step) => step.id).filter((id) => beforeById.has(id));
  if (keptBefore.join('\n') !== keptAfter.join('\n')) {
    entries.push({ kind: 'reordered', before: keptBefore, after: keptAfter });
  }
  return entries;
}
