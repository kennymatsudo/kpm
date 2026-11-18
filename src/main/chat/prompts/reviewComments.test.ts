import { describe, expect, it } from 'vitest';
import type { DiffReviewComment } from '../../../shared/diffReview';
import { formatReviewCommentBlock, relocateComment } from './reviewComments';

const base: DiffReviewComment = {
  id: 'k', projectId: 'p', chatSessionId: 'c', rootPath: '/proj', filePath: 'docs/a.md',
  side: 'new', startLine: 3, endLine: 3, quotedText: 'Status: draft', body: 'Drop the date', createdAt: '',
};

describe('relocateComment', () => {
  it('keeps lines when the text is still there', () => {
    const text = 'a\nb\nStatus: draft\nd';
    expect(relocateComment(base, text)).toEqual({ comment: base, changed: false });
  });

  it('moves to the nearest match when lines shifted', () => {
    const text = 'new\nnew\na\nb\nStatus: draft';
    const result = relocateComment(base, text);
    expect(result.changed).toBe(false);
    expect(result.comment.startLine).toBe(5);
    expect(result.comment.endLine).toBe(5);
  });

  it('flags a comment whose text is gone', () => {
    expect(relocateComment(base, 'nothing here').changed).toBe(true);
  });

  it('never relocates removed-line comments', () => {
    const old = { ...base, side: 'old' as const };
    expect(relocateComment(old, 'anything')).toEqual({ comment: old, changed: false });
  });
});

describe('formatReviewCommentBlock', () => {
  it('formats single lines, ranges, removed lines, and changed text', () => {
    const block = formatReviewCommentBlock([
      { comment: base, changed: false },
      { comment: { ...base, id: 'k2', rootPath: '/repo', filePath: 'x.py', side: 'old', startLine: 10, endLine: 11, quotedText: 'a\nb', body: 'Why?' }, changed: false },
      { comment: { ...base, id: 'k3', body: 'Gone?' }, changed: true },
    ]);
    expect(block).toBe([
      'Review comments (3):',
      '1. /proj/docs/a.md:3',
      '   > Status: draft',
      '   Drop the date',
      '2. /repo/x.py:10-11 (removed lines)',
      '   > a',
      '   > b',
      '   Why?',
      '3. /proj/docs/a.md:3 (this text has changed since the comment)',
      '   > Status: draft',
      '   Gone?',
    ].join('\n'));
  });

  it('caps quotes at 10 lines', () => {
    const quotedText = Array.from({ length: 14 }, (_, i) => `l${i}`).join('\n');
    const block = formatReviewCommentBlock([{ comment: { ...base, endLine: 16, quotedText }, changed: false }]);
    expect(block).toContain('   > l9\n   (4 more lines)');
  });
});
