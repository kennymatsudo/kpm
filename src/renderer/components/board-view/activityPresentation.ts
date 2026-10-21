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
// Every board command already runs in the task's worktree, so a leading
// `cd <path> &&` only pushes the real command off the end of the row.
const LEADING_CD_RE = /^((?:Run|Running)\s+)?cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*(?:&&|;)\s*/;
const VERIFICATION_COMMAND_RE = /\b(pytest|vitest|npm\s+test|make\s+test|jest|lint|eslint|py_compile|tsc\s+--noemit|typecheck|git\s+(diff|status))\b/;

function isSignificant(activity: AgentActivity): boolean {
  if (activity.type === 'error' || activity.type === 'system') return true;
  if (activity.type !== 'tool_use') return false;
  if (activity.kind === 'read') return false;
  return !(activity.kind === 'run' && BASH_EXPLORATION_RE.test((activity.toolInput?.trimStart() ?? '').replace(LEADING_CD_RE, '')));
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
  if (activity.kind !== 'run') return activity.summary;
  return commandLabel(activity.toolInput) ?? activity.summary.replace(LEADING_CD_RE, '$1');
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

/**
 * A board agent run appends activities one at a time for as long as it lasts,
 * so the feed folds each new activity into the groups it already built rather
 * than re-deriving them from the whole history. Groups the activity does not
 * touch keep their identity, which is what lets the rendered feed stay memoized.
 */
interface FeedFold {
  activities: AgentActivity[];
  groups: ActivityPresentationGroup[];
  /**
   * Pairing state for `tool_result` -> `tool_use`. Prefers `callId` correlation
   * — exact, and survives parallel calls to the same tool — and falls back to
   * matching by tool name in call order for activities minted before an adapter
   * carried a call id.
   */
  pendingById: Map<string, AgentActivity>;
  pendingByName: Map<string, AgentActivity[]>;
  entryLocationByUse: Map<AgentActivity, { groupIndex: number; entryIndex: number }>;
}

/** Retained activities per session, and how many are dropped once that is exceeded. */
const MAX_FEED_ACTIVITIES = 1000;
const EVICTION_BATCH = 200;

function emptyFold(): FeedFold {
  return {
    activities: [],
    groups: [],
    pendingById: new Map(),
    pendingByName: new Map(),
    entryLocationByUse: new Map(),
  };
}

function replaceGroup(fold: FeedFold, index: number, group: ActivityPresentationGroup): void {
  const next = fold.groups.slice();
  next[index] = group;
  fold.groups = next;
}

function openGroupIndex(fold: FeedFold): number {
  if (fold.groups.length === 0) {
    fold.groups = [{ narration: null, entries: [] }];
  }
  return fold.groups.length - 1;
}

function placeEntry(fold: FeedFold, activity: AgentActivity): void {
  const groupIndex = openGroupIndex(fold);
  const group = fold.groups[groupIndex];
  const label = labelFor(activity);
  const previous = group.entries.at(-1);

  const entries = group.entries.slice();
  if (isPolling(activity) && previous?.kind === 'collapsed' && previous.label === label) {
    entries[entries.length - 1] = {
      ...previous,
      activities: [...previous.activities, activity],
      status: statusFor(activity, previous.result),
    };
  } else if (isPolling(activity)) {
    entries.push({
      kind: 'collapsed',
      activities: [activity],
      label,
      result: undefined,
      icon: iconFor(activity),
      status: statusFor(activity, undefined),
    });
  } else {
    entries.push({
      kind: 'activity',
      activity,
      result: undefined,
      label,
      icon: iconFor(activity),
      status: statusFor(activity, undefined),
    });
  }

  replaceGroup(fold, groupIndex, { ...group, entries });
  fold.entryLocationByUse.set(activity, { groupIndex, entryIndex: entries.length - 1 });
}

function pairResult(fold: FeedFold, result: AgentActivity): void {
  let toolUse: AgentActivity | undefined;
  if (result.callId && fold.pendingById.has(result.callId)) {
    toolUse = fold.pendingById.get(result.callId);
    fold.pendingById.delete(result.callId);
  } else {
    toolUse = fold.pendingByName.get(result.toolName ?? '')?.shift();
  }
  if (!toolUse) return;

  const location = fold.entryLocationByUse.get(toolUse);
  if (!location) return;
  const group = fold.groups[location.groupIndex];
  const entry = group?.entries[location.entryIndex];
  if (!entry) return;

  const entries = group.entries.slice();
  entries[location.entryIndex] =
    entry.kind === 'collapsed'
      ? { ...entry, result, status: statusFor(entry.activities.at(-1)!, result) }
      : { ...entry, result, status: statusFor(entry.activity, result) };
  replaceGroup(fold, location.groupIndex, { ...group, entries });
}

function applyActivity(fold: FeedFold, activity: AgentActivity): void {
  fold.activities.push(activity);

  if (activity.type === 'message') {
    fold.groups = [...fold.groups, { narration: activity, entries: [] }];
    return;
  }

  if (activity.type === 'tool_use') {
    if (activity.callId) {
      fold.pendingById.set(activity.callId, activity);
    } else {
      const key = activity.toolName ?? '';
      fold.pendingByName.set(key, [...(fold.pendingByName.get(key) ?? []), activity]);
    }
  }

  if (activity.type === 'tool_result') {
    pairResult(fold, activity);
    return;
  }

  if (isSignificant(activity)) placeEntry(fold, activity);
}

function foldActivities(activities: readonly AgentActivity[]): FeedFold {
  const fold = emptyFold();
  for (const activity of activities) applyActivity(fold, activity);
  return fold;
}

export function presentActivities(activities: AgentActivity[]): ActivityPresentationGroup[] {
  return foldActivities(activities).groups;
}

export interface ActivityFeed {
  readonly groups: readonly ActivityPresentationGroup[];
  readonly count: number;
  readonly latest: AgentActivity | undefined;
  toArray(): AgentActivity[];
}

class FoldedFeed implements ActivityFeed {
  constructor(
    readonly fold: FeedFold,
    readonly groups: readonly ActivityPresentationGroup[],
    readonly count: number,
    readonly latest: AgentActivity | undefined
  ) {}

  toArray(): AgentActivity[] {
    return [...this.fold.activities];
  }
}

function snapshot(fold: FeedFold): ActivityFeed {
  return new FoldedFeed(fold, fold.groups, fold.activities.length, fold.activities.at(-1));
}

export function createActivityFeed(activities: readonly AgentActivity[] = []): ActivityFeed {
  return snapshot(foldActivities(activities));
}

export function appendActivity(feed: ActivityFeed, activity: AgentActivity): ActivityFeed {
  const fold = (feed as FoldedFeed).fold;
  applyActivity(fold, activity);

  if (fold.activities.length > MAX_FEED_ACTIVITIES + EVICTION_BATCH) {
    return snapshot(foldActivities(fold.activities.slice(-MAX_FEED_ACTIVITIES)));
  }
  return snapshot(fold);
}
