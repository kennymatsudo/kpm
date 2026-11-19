import { describe, expect, it } from 'vitest';
import type { TurnChanges } from '../../../shared/diffReview';
import { latestTurnForFile } from './latestTurnForFile';

const turn = (id: string, createdAt: string, files: [string, string][]): TurnChanges => ({
  chatSessionId: 's1',
  clientMessageId: id,
  createdAt,
  files: files.map(([rootPath, path]) => ({ rootPath, path, status: 'modified', additions: 1, deletions: 0 })),
});

describe('latestTurnForFile', () => {
  it('returns undefined with no turns', () => {
    expect(latestTurnForFile(undefined, '/r', 'a.md')).toBeUndefined();
    expect(latestTurnForFile([], '/r', 'a.md')).toBeUndefined();
  });

  it('picks the most recent turn that lists the file', () => {
    const turns = [
      turn('m1', '2026-01-01T00:00:00Z', [['/r', 'a.md']]),
      turn('m2', '2026-01-02T00:00:00Z', [['/r', 'a.md']]),
      turn('m3', '2026-01-03T00:00:00Z', [['/r', 'b.md']]),
    ];
    expect(latestTurnForFile(turns, '/r', 'a.md')?.clientMessageId).toBe('m2');
  });

  it('matches both root and path', () => {
    const turns = [turn('m1', '2026-01-01T00:00:00Z', [['/other', 'a.md']])];
    expect(latestTurnForFile(turns, '/r', 'a.md')).toBeUndefined();
  });

  it('does not depend on array order', () => {
    const turns = [
      turn('m2', '2026-01-02T00:00:00Z', [['/r', 'a.md']]),
      turn('m1', '2026-01-01T00:00:00Z', [['/r', 'a.md']]),
    ];
    expect(latestTurnForFile(turns, '/r', 'a.md')?.clientMessageId).toBe('m2');
  });
});
