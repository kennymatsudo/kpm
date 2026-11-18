import { describe, expect, it } from 'vitest';
import { anchorForLines, buildReviewRows, fileDiffFromText } from './diffRows';
import type { DiffLine, FileDiff } from './diffReview';

function ctx(n: number): DiffLine { return { kind: 'context', oldLine: n, newLine: n, text: `l${n}` }; }

const file: FileDiff = {
  rootPath: '/r', path: 'a', status: 'modified', additions: 1, deletions: 0, binary: false,
  hunks: [{ oldStart: 1, newStart: 1, lines: [
    ...Array.from({ length: 10 }, (_, i) => ctx(i + 1)),
    { kind: 'add', oldLine: null, newLine: 11, text: 'added' },
    ...Array.from({ length: 10 }, (_, i) => ({ kind: 'context' as const, oldLine: i + 11, newLine: i + 12, text: `m${i}` })),
  ] }],
};

describe('buildReviewRows', () => {
  it('collapses unchanged runs beyond 3 lines of context', () => {
    const rows = buildReviewRows(file, { expanded: new Set(), expandAll: false });
    expect(rows[0]).toMatchObject({ kind: 'collapsed', count: 7 });
    expect(rows.filter((r) => r.kind === 'line')).toHaveLength(7);
    expect(rows[rows.length - 1]).toMatchObject({ kind: 'collapsed', count: 7 });
  });

  it('expands a run by key and everything with expandAll', () => {
    const first = buildReviewRows(file, { expanded: new Set(), expandAll: false })[0];
    expect(buildReviewRows(file, { expanded: new Set([first.key]), expandAll: false })[0].kind).toBe('line');
    expect(buildReviewRows(file, { expanded: new Set(), expandAll: true }).every((r) => r.kind === 'line')).toBe(true);
  });
});

describe('fileDiffFromText', () => {
  it('numbers every line as context, or as added for a new file', () => {
    expect(fileDiffFromText('/r', 'a', 'x\ny').hunks[0].lines[1]).toEqual({ kind: 'context', oldLine: 2, newLine: 2, text: 'y' });
    expect(fileDiffFromText('/r', 'a', 'x', 'added').hunks[0].lines[0]).toEqual({ kind: 'add', oldLine: null, newLine: 1, text: 'x' });
  });
});

describe('anchorForLines', () => {
  it('uses new-side numbers when any row has one', () => {
    expect(anchorForLines([
      { kind: 'del', oldLine: 4, newLine: null, text: 'gone' },
      { kind: 'add', oldLine: null, newLine: 4, text: 'here' },
      { kind: 'context', oldLine: 5, newLine: 5, text: 'next' },
    ])).toEqual({ side: 'new', startLine: 4, endLine: 5, quotedText: 'here\nnext' });
  });

  it('uses old-side numbers for removed lines only', () => {
    expect(anchorForLines([{ kind: 'del', oldLine: 9, newLine: null, text: 'x' }])).toEqual({ side: 'old', startLine: 9, endLine: 9, quotedText: 'x' });
  });

  it('returns null for no lines', () => {
    expect(anchorForLines([])).toBeNull();
  });
});
