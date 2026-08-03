import type { Activity, ActivityType } from '../../../shared/types';

export interface ProcessSummary {
  /** Semantic phrases describing what ran, e.g. `read 12 files`. */
  parts: string[];
  toolCount: number;
  additions: number;
  deletions: number;
}

const PHRASE_BY_TYPE: Record<ActivityType, (count: number) => string> = {
  read: (n) => `read ${n} ${plural(n, 'file')}`,
  search: (n) => `searched ${n} ${plural(n, 'pattern')}`,
  glob: (n) => `matched ${n} ${plural(n, 'path pattern')}`,
  command: (n) => `ran ${n} ${plural(n, 'command')}`,
  thinking: (n) => `reasoned ${n} ${plural(n, 'time')}`,
  other: (n) => `used ${n} ${plural(n, 'tool')}`,
  edit: (n) => `edited ${n} ${plural(n, 'file')}`,
};

/** Edits land last so the diff counts read as part of the same phrase. */
const PHRASE_ORDER: ActivityType[] = [
  'read',
  'search',
  'glob',
  'command',
  'thinking',
  'other',
  'edit',
];

export function summarizeActivities(activities: Activity[]): ProcessSummary {
  const counts = new Map<ActivityType, number>();
  let additions = 0;
  let deletions = 0;

  for (const activity of activities) {
    counts.set(activity.type, (counts.get(activity.type) ?? 0) + 1);
    if (activity.diffStats) {
      additions += activity.diffStats.additions;
      deletions += activity.diffStats.deletions;
    }
  }

  const parts = PHRASE_ORDER.filter((type) => counts.has(type)).map((type) =>
    PHRASE_BY_TYPE[type](counts.get(type)!)
  );

  return { parts, toolCount: activities.length, additions, deletions };
}

/** `Worked for 7m 16s` / `Working for 2m 10s`, matching the tense of the tool phrases. */
export function formatWorkedFor(seconds: number | null | undefined, isStreaming: boolean): string | null {
  if (seconds == null || seconds < 0) return null;
  const verb = isStreaming ? 'Working for' : 'Worked for';
  return `${verb} ${formatDuration(seconds)}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}
