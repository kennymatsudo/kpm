import { describe, expect, it } from 'vitest';
import type { Activity } from '../../../shared/types';
import { formatWorkedFor, summarizeActivities } from './processSummary';

function activity(id: string, type: Activity['type'], diffStats?: Activity['diffStats']): Activity {
  return { id, type, label: id, ...(diffStats ? { diffStats } : {}) };
}

describe('summarizeActivities', () => {
  it('describes what ran instead of counting tools, with edits last', () => {
    const summary = summarizeActivities([
      activity('e1', 'edit', { additions: 100, deletions: 40 }),
      activity('r1', 'read'),
      activity('c1', 'command'),
      activity('r2', 'read'),
      activity('e2', 'edit', { additions: 28, deletions: 24 }),
    ]);

    expect(summary.parts).toEqual(['read 2 files', 'ran 1 command', 'edited 2 files']);
    expect(summary.additions).toBe(128);
    expect(summary.deletions).toBe(64);
    expect(summary.toolCount).toBe(5);
  });

  it('handles an empty run', () => {
    expect(summarizeActivities([])).toEqual({
      parts: [],
      toolCount: 0,
      additions: 0,
      deletions: 0,
    });
  });
});

describe('formatWorkedFor', () => {
  it('matches tense to whether the turn is still running', () => {
    expect(formatWorkedFor(436, false)).toBe('Worked for 7m 16s');
    expect(formatWorkedFor(130, true)).toBe('Working for 2m 10s');
    expect(formatWorkedFor(120, false)).toBe('Worked for 2m');
    expect(formatWorkedFor(9, false)).toBe('Worked for 9s');
  });

  it('returns null when there is no duration to report', () => {
    expect(formatWorkedFor(null, false)).toBeNull();
    expect(formatWorkedFor(undefined, true)).toBeNull();
  });
});
