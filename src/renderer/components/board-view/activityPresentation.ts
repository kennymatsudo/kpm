import type { AgentActivity } from '../../../shared/agent-types';

/** What icon an entry renders. Derived from `AgentActivity.kind`/`type` so `ActivityTab` never pattern-matches a raw tool name. */
export type ActivityIconKind = 'error' | 'system' | 'edit' | 'read' | 'run' | 'other';

export type ActivityStatusLabel = 'Passed' | 'Failed' | 'Running' | null;

export type ActivityPresentationEntry =
  | { kind: 'activity'; activity: AgentActivity; result?: AgentActivity; label: string; icon: ActivityIconKind; status: ActivityStatusLabel }
  | { kind: 'collapsed'; activities: AgentActivity[]; label: string; result?: AgentActivity; icon: ActivityIconKind; status: ActivityStatusLabel };

export interface ActivityPresentationGroup {
  narration: AgentActivity | null;
  entries: ActivityPresentationEntry[];
}

const BASH_EXPLORATION_RE = /^(ls|find|cat|head|tail|wc|tree|echo|pwd|which)(\s|$)/;
const POLLING_COMMAND_RE = /\bsleep\s+\d+\s*;/;
const VERIFICATION_COMMAND_RE = /\b(pytest|vitest|npm\s+test|make\s+test|jest|lint|eslint|py_compile|tsc\s+--noemit|typecheck|git\s+(diff|status))\b/;

/**
 * Pair each `tool_result` to its originating `tool_use`. Prefers `callId`
 * correlation — exact, and survives parallel calls to the same tool — and
 * falls back to matching by tool name in call order for activities minted
 * before an adapter carried a call id.
 */
function toolResultByUse(activities: AgentActivity[]): Map<AgentActivity, AgentActivity> {
  const results = new Map<AgentActivity, AgentActivity>();
  const pendingById = new Map<string, AgentActivity>();
  const pendingByName = new Map<string, AgentActivity[]>();

  for (const activity of activities) {
    if (activity.type === 'tool_use') {
      if (activity.callId) {
        pendingById.set(activity.callId, activity);
      } else {
        const key = activity.toolName ?? '';
        pendingByName.set(key, [...(pendingByName.get(key) ?? []), activity]);
      }
      continue;
    }
    if (activity.type !== 'tool_result') continue;

    if (activity.callId && pendingById.has(activity.callId)) {
      results.set(pendingById.get(activity.callId)!, activity);
      pendingById.delete(activity.callId);
      continue;
    }

    const key = activity.toolName ?? '';
    const uses = pendingByName.get(key);
    const toolUse = uses?.shift();
    if (toolUse) results.set(toolUse, activity);
  }

  return results;
}

function isSignificant(activity: AgentActivity): boolean {
  if (activity.type === 'error' || activity.type === 'system') return true;
  if (activity.type !== 'tool_use') return false;
  if (activity.kind === 'read') return false;
  return !(activity.kind === 'run' && BASH_EXPLORATION_RE.test(activity.toolInput?.trimStart() ?? ''));
}

function commandLabel(command: string | undefined): string | null {
  if (!command) return null;
  const normalized = command.toLowerCase();
  if (POLLING_COMMAND_RE.test(command)) {
    if (normalized.includes('lint')) return 'Waiting for lint results';
    if (normalized.includes('test')) return 'Waiting for test results';
    return 'Waiting for command results';
  }
  if (/\b(pytest|vitest|npm test|make test|jest)\b/.test(normalized)) return 'Running tests';
  if (/\b(lint|eslint)\b/.test(normalized)) return 'Running lint';
  if (/\b(py_compile|tsc\s+--noemit|typecheck)\b/.test(normalized)) return 'Checking types and syntax';
  if (/\bgit\s+diff\s+--check\b/.test(normalized)) return 'Checking changes';
  if (/\bgit\s+(diff|status)\b/.test(normalized)) return 'Inspecting changes';
  if (/\brm\s+-f\s+\/tmp\//.test(normalized)) return 'Preparing verification';
  return null;
}

function labelFor(activity: AgentActivity): string {
  if (activity.type === 'error' || activity.type === 'system') return activity.summary;
  const command = activity.kind === 'run' ? commandLabel(activity.toolInput) : null;
  return command ?? activity.summary;
}

/** Whether a `run` activity's command reads as a check worth a Passed/Failed/Running badge. */
function isVerificationCommand(activity: AgentActivity): boolean {
  return activity.kind === 'run' && VERIFICATION_COMMAND_RE.test((activity.toolInput ?? '').toLowerCase());
}

function iconFor(activity: AgentActivity): ActivityIconKind {
  if (activity.type === 'error') return 'error';
  if (activity.type === 'system') return 'system';
  switch (activity.kind) {
    case 'edit': return 'edit';
    case 'read': return 'read';
    case 'run': return 'run';
    case 'other':
    case undefined:
      return 'other';
  }
}

function statusFor(activity: AgentActivity, result?: AgentActivity): ActivityStatusLabel {
  const status = result?.status ?? activity.status;
  if (status === 'failed') return 'Failed';
  if (activity.type !== 'error' && !isVerificationCommand(activity)) return null;
  if (status === 'success') return 'Passed';
  if (status === 'running') return 'Running';
  return null;
}

function isPolling(activity: AgentActivity): boolean {
  return activity.type === 'tool_use' && activity.kind === 'run' && POLLING_COMMAND_RE.test(activity.toolInput ?? '');
}

function collapsePolling(entries: ActivityPresentationEntry[]): ActivityPresentationEntry[] {
  const collapsed: ActivityPresentationEntry[] = [];

  for (const entry of entries) {
    if (entry.kind !== 'activity' || !isPolling(entry.activity)) {
      collapsed.push(entry);
      continue;
    }

    const previous = collapsed.at(-1);
    if (previous?.kind === 'collapsed' && previous.label === entry.label) {
      previous.activities.push(entry.activity);
      previous.result = entry.result ?? previous.result;
      previous.status = statusFor(previous.activities.at(-1)!, previous.result);
      continue;
    }
    collapsed.push({
      kind: 'collapsed',
      activities: [entry.activity],
      label: entry.label,
      result: entry.result,
      icon: entry.icon,
      status: entry.status,
    });
  }

  return collapsed;
}

export function presentActivities(activities: AgentActivity[]): ActivityPresentationGroup[] {
  const results = toolResultByUse(activities);
  const groups: ActivityPresentationGroup[] = [];
  let current: ActivityPresentationGroup = { narration: null, entries: [] };

  const flush = () => {
    if (current.narration || current.entries.length > 0) {
      groups.push({ ...current, entries: collapsePolling(current.entries) });
    }
  };

  for (const activity of activities) {
    if (activity.type === 'message') {
      flush();
      current = { narration: activity, entries: [] };
    } else if (isSignificant(activity)) {
      const result = results.get(activity);
      current.entries.push({
        kind: 'activity',
        activity,
        result,
        label: labelFor(activity),
        icon: iconFor(activity),
        status: statusFor(activity, result),
      });
    }
  }
  flush();

  return groups;
}
