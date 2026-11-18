import { describe, expect, it } from 'vitest';
import { diffReviewEndpoints } from './diffReviewEndpoints';

const base = {
  projectId: '11111111-1111-4111-8111-111111111111',
  chatSessionId: '22222222-2222-4222-8222-222222222222',
  rootPath: '/repo',
  filePath: 'docs/a.md',
  side: 'new' as const,
  startLine: 2,
  endLine: 3,
  quotedText: 'x',
  body: 'note',
};
const parse = (over: Record<string, unknown>) => diffReviewEndpoints.createComment.params.safeParse({ ...base, ...over });

describe('diffReview createComment params', () => {
  it('accepts a relative path', () => {
    expect(parse({}).success).toBe(true);
  });

  it.each(['/etc/x', 'a/../b', 'a\\b', '..'])('rejects filePath %s', (filePath) => {
    expect(parse({ filePath }).success).toBe(false);
  });

  it('rejects endLine before startLine', () => {
    expect(parse({ startLine: 5, endLine: 4 }).success).toBe(false);
  });

  it('accepts endLine equal to startLine', () => {
    expect(parse({ startLine: 4, endLine: 4 }).success).toBe(true);
  });

  it('rejects a blank body', () => {
    expect(parse({ body: '   ' }).success).toBe(false);
  });
});
