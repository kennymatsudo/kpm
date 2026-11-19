import { describe, expect, it } from 'vitest';
import type { TurnFileChange } from '../../../shared/diffReview';
import { attributeHeadMove } from './headMove';

const file = (path: string, oldPath?: string): TurnFileChange => ({
  rootPath: '/r',
  path,
  ...(oldPath ? { oldPath } : {}),
  status: oldPath ? 'renamed' : 'modified',
  additions: 1,
  deletions: 0,
});

const run = (
  files: TurnFileChange[],
  sets: Partial<Record<'dirtyBefore' | 'dirtyAfter' | 'headMoved' | 'turnCommitFiles', string[]>>,
) =>
  attributeHeadMove({
    files,
    dirtyBefore: new Set(sets.dirtyBefore),
    dirtyAfter: new Set(sets.dirtyAfter),
    headMoved: new Set(sets.headMoved),
    turnCommitFiles: new Set(sets.turnCommitFiles),
  }).map((f) => f.path);

describe('attributeHeadMove', () => {
  it('drops a file only the HEAD move changed', () => {
    expect(run([file('pulled.ts'), file('mine.ts')], { headMoved: ['pulled.ts'] })).toEqual(['mine.ts']);
  });

  it('keeps a file committed by the agent during the turn', () => {
    expect(run([file('a.ts')], { headMoved: ['a.ts'], turnCommitFiles: ['a.ts'] })).toEqual(['a.ts']);
  });

  it('keeps a file that was dirty at the start', () => {
    expect(run([file('a.ts')], { headMoved: ['a.ts'], dirtyBefore: ['a.ts'] })).toEqual(['a.ts']);
  });

  it('keeps a file that is dirty at the end', () => {
    expect(run([file('a.ts')], { headMoved: ['a.ts'], dirtyAfter: ['a.ts'] })).toEqual(['a.ts']);
  });

  it('drops a rename when the old and new paths both moved with HEAD', () => {
    expect(run([file('new.ts', 'old.ts')], { headMoved: ['new.ts', 'old.ts'] })).toEqual([]);
  });

  it('keeps a rename when only the old path moved with HEAD', () => {
    expect(run([file('new.ts', 'old.ts')], { headMoved: ['old.ts'] })).toEqual(['new.ts']);
  });
});
