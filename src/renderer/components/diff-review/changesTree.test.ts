import { describe, expect, it } from 'vitest';
import type { DiffReviewComment, FileDiff } from '../../../shared/diffReview';
import { LARGE_DIFF_LINES, buildChangesTree, countCommentsByFile, fileKey, totalsFor } from './changesTree';

function file(rootPath: string, path: string, additions = 1, deletions = 0): FileDiff {
  return { rootPath, path, status: 'modified', additions, deletions, binary: false, hunks: [] };
}

describe('buildChangesTree', () => {
  it('groups by root, then directory, keeping first-seen order', () => {
    const tree = buildChangesTree(
      [file('/a/proj', 'src/x.ts'), file('/b/repo', 'README.md'), file('/a/proj', 'src/y.ts'), file('/a/proj', 'top.ts')],
      new Map([['/a/proj:src/y.ts', 2]]),
    );
    expect(tree.map((r) => r.label)).toEqual(['proj', 'repo']);
    expect(tree[0].dirs.map((d) => d.dir)).toEqual(['src', '']);
    expect(tree[0].dirs[0].files.map((f) => [f.base, f.commentCount])).toEqual([
      ['x.ts', 0],
      ['y.ts', 2],
    ]);
    expect(tree[1].dirs[0].files[0].key).toBe('/b/repo:README.md');
  });
});

describe('countCommentsByFile', () => {
  it('counts per root and path', () => {
    const c = (rootPath: string, filePath: string) => ({ rootPath, filePath }) as DiffReviewComment;
    const counts = countCommentsByFile([c('/r', 'a'), c('/r', 'a'), c('/r', 'b')]);
    expect(counts.get(fileKey('/r', 'a'))).toBe(2);
    expect(counts.get(fileKey('/r', 'b'))).toBe(1);
  });
});

describe('totalsFor', () => {
  it('sums additions and deletions', () => {
    expect(totalsFor([file('/r', 'a', 3, 1), file('/r', 'b', 2, 4)])).toEqual({ files: 2, additions: 5, deletions: 5 });
  });
});

describe('LARGE_DIFF_LINES', () => {
  it('is 400', () => expect(LARGE_DIFF_LINES).toBe(400));
});
