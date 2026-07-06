import { describe, it, expect } from 'vitest';
import {
  sanitizeReviewCommentBody,
  resolveThreadFilePath,
  applyAssessmentBusinessRules,
  applyPostImplBusinessRules,
} from './ReviewAssessmentService';

describe('sanitizeReviewCommentBody', () => {
  it('leaves plain text unchanged', () => {
    expect(sanitizeReviewCommentBody('This looks fine.')).toBe('This looks fine.');
  });

  it('strips HTML comments', () => {
    expect(sanitizeReviewCommentBody('Hello<!-- nit: rename this -->World')).toBe('HelloWorld');
  });

  it('replaces a bare cursor.com link with a placeholder', () => {
    expect(sanitizeReviewCommentBody('See https://cursor.com/open?file=foo.ts&line=1 for details')).toBe(
      'See [cursor link omitted] for details'
    );
  });

  it('converts <br> tags to newlines and drops layout tags while keeping content', () => {
    expect(sanitizeReviewCommentBody('<div><p>first<br>second</p></div>')).toBe('first\nsecond');
  });

  it('collapses runs of blank lines and trims leading/trailing whitespace', () => {
    expect(sanitizeReviewCommentBody('  \nfirst\n\n\n\nsecond\n  ')).toBe('first\n\nsecond');
  });
});

describe('resolveThreadFilePath', () => {
  it('resolves a relative thread path against the repo root', () => {
    expect(resolveThreadFilePath('/repo', 'src/index.ts')).toBe('/repo/src/index.ts');
  });

  it('returns null for an absolute thread path', () => {
    expect(resolveThreadFilePath('/repo', '/etc/passwd')).toBeNull();
  });

  it('returns null when the resolved path escapes the repo root', () => {
    expect(resolveThreadFilePath('/repo', '../outside.ts')).toBeNull();
  });
});

describe('applyAssessmentBusinessRules', () => {
  it('maps a happy-path batch of dispositions and nulls draft_reply for non-push_back threads', () => {
    const { results, errors } = applyAssessmentBusinessRules({
      assessments: [
        { thread_id: 't1', disposition: 'implement', rationale: 'Real bug.', draft_reply: 'ignored for implement' },
        { thread_id: 't2', disposition: 'push_back', rationale: 'Out of scope.', draft_reply: 'Not in scope here.' },
        { thread_id: 't3', disposition: 'needs_user_input', rationale: 'Could go either way.', draft_reply: null },
      ],
    });

    expect(errors).toEqual([]);
    expect(results).toEqual([
      { threadId: 't1', disposition: 'implement', rationale: 'Real bug.', draftReply: null },
      { threadId: 't2', disposition: 'push_back', rationale: 'Out of scope.', draftReply: 'Not in scope here.' },
      { threadId: 't3', disposition: 'needs_user_input', rationale: 'Could go either way.', draftReply: null },
    ]);
  });

  it('skips entries with a missing rationale and records an error, continuing to process the rest', () => {
    const { results, errors } = applyAssessmentBusinessRules({
      assessments: [
        { thread_id: 't1', disposition: 'implement', rationale: '   ', draft_reply: null },
        { thread_id: 't2', disposition: 'implement', rationale: 'Real bug.', draft_reply: null },
      ],
    });

    expect(results).toEqual([
      { threadId: 't2', disposition: 'implement', rationale: 'Real bug.', draftReply: null },
    ]);
    expect(errors).toEqual(['Skipped entry for thread t1: missing rationale']);
  });

  it('skips a push_back entry with no draft_reply and records an error', () => {
    const { results, errors } = applyAssessmentBusinessRules({
      assessments: [
        { thread_id: 't1', disposition: 'push_back', rationale: 'Out of scope.', draft_reply: null },
      ],
    });

    expect(results).toEqual([]);
    expect(errors).toEqual(['Thread t1: push_back disposition but no draft_reply provided']);
  });

  it('treats a whitespace-only draft_reply as missing for a push_back entry', () => {
    const { results, errors } = applyAssessmentBusinessRules({
      assessments: [
        { thread_id: 't1', disposition: 'push_back', rationale: 'Out of scope.', draft_reply: '   ' },
      ],
    });

    expect(results).toEqual([]);
    expect(errors).toEqual(['Thread t1: push_back disposition but no draft_reply provided']);
  });
});

describe('applyPostImplBusinessRules', () => {
  it('maps an addressed thread through with its draft reply', () => {
    const { results, errors } = applyPostImplBusinessRules({
      replies: [
        { thread_id: 't1', addressed: true, reason: null, draft_reply: 'Fixed — now validates before the DB call.' },
      ],
    });

    expect(errors).toEqual([]);
    expect(results).toEqual([
      { threadId: 't1', addressed: true, reason: null, draftReply: 'Fixed — now validates before the DB call.' },
    ]);
  });

  it('maps an unaddressed thread through with its reason and a null draft reply', () => {
    const { results, errors } = applyPostImplBusinessRules({
      replies: [
        { thread_id: 't1', addressed: false, reason: 'No matching change in the diff yet.', draft_reply: null },
      ],
    });

    expect(errors).toEqual([]);
    expect(results).toEqual([
      { threadId: 't1', addressed: false, reason: 'No matching change in the diff yet.', draftReply: null },
    ]);
  });

  it('normalizes whitespace-only reason and draft_reply to null', () => {
    const { results } = applyPostImplBusinessRules({
      replies: [
        { thread_id: 't1', addressed: false, reason: '   ', draft_reply: '   ' },
      ],
    });

    expect(results).toEqual([
      { threadId: 't1', addressed: false, reason: null, draftReply: null },
    ]);
  });

  it('never produces errors, even across multiple threads', () => {
    const { errors } = applyPostImplBusinessRules({
      replies: [
        { thread_id: 't1', addressed: true, reason: null, draft_reply: 'Done.' },
        { thread_id: 't2', addressed: false, reason: null, draft_reply: null },
      ],
    });

    expect(errors).toEqual([]);
  });
});
