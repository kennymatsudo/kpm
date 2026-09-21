import { describe, expect, it } from 'vitest';
import type { PrReviewThread, ReviewInboxSnapshot, ReviewTask } from '../../../shared/types';
import { getStats } from './reviewStats';

const NOW = '2026-01-01T00:00:00.000Z';

function makeThread(overrides: Partial<PrReviewThread> = {}): PrReviewThread {
  return {
    id: 'thread-1',
    url: 'https://github.com/acme/repo/pull/42#discussion_r1',
    path: 'src/file.ts',
    line: 10,
    startLine: null,
    subjectType: 'LINE',
    diffSide: 'RIGHT',
    isResolved: false,
    isOutdated: false,
    resolvedBy: null,
    updatedAt: NOW,
    participants: ['reviewer'],
    comments: [],
    hasBotOnlyComments: false,
    hasHumanReviewerComment: true,
    latestCommentPreview: 'Please fix this',
    ...overrides,
  };
}

function makeTask(overrides: Partial<ReviewTask> = {}): ReviewTask {
  return {
    id: 'task-1',
    project_id: 'project-1',
    repo_id: 'repo-1',
    session_id: 'session-1',
    pr_number: 42,
    thread_id: 'thread-1',
    thread_url: 'https://github.com/acme/repo/pull/42#discussion_r1',
    path: 'src/file.ts',
    line: 10,
    source: 'human',
    status: 'assessed',
    internal_state: 'stale',
    disposition: 'needs_user_input',
    rationale: null,
    draft_reply: null,
    priority: 'high',
    title: 'Review feedback on src/file.ts:10',
    latest_comment_preview: 'Please fix this',
    last_seen_comment_id: 'comment-1',
    last_seen_updated_at: NOW,
    last_agent_run_at: null,
    last_posted_reply_id: null,
    error: 'Previous assessment failed',
    created_at: NOW,
    updated_at: NOW,
    completed_at: null,
    ...overrides,
  };
}

function makeInbox(thread: PrReviewThread | null, task: ReviewTask): ReviewInboxSnapshot {
  return {
    session_id: 'session-1',
    snapshot: thread
      ? {
        prNumber: 42,
        prUrl: 'https://github.com/acme/repo/pull/42',
        title: 'Review PR',
        state: 'OPEN',
        reviewDecision: 'CHANGES_REQUESTED',
        headOid: 'head-sha',
        baseRefName: 'main',
        headRefName: 'feature/test',
        updatedAt: NOW,
        isDraft: false,
        fetchedAt: NOW,
        summary: {
          totalThreads: 1,
          unresolvedThreads: thread.isResolved ? 0 : 1,
          resolvedThreads: thread.isResolved ? 1 : 0,
          outdatedThreads: thread.isOutdated ? 1 : 0,
          actionableThreads: thread.isResolved || thread.isOutdated ? 0 : 1,
          humanThreads: 1,
          botOnlyThreads: 0,
          topLevelReviewCount: 0,
          conversationCommentCount: 0,
        },
        threads: [thread],
        topLevelReviews: [],
        conversationComments: [],
      }
      : null,
    tasks: [task],
    ownership: null,
    sync_state: null,
    fetched_at: NOW,
  };
}

// `getStats` is a thin projection onto `summarizeReviewThreads` (see
// `shared/reviewThreadSummary.test.ts`, which owns the resolved/outdated
// filtering and attention-classification domain logic exhaustively). These
// tests cover only what's unique to this wrapper: how it maps its own
// `ReviewInboxSnapshot | null` input shape onto that shared call, and that it
// surfaces the `.work` half of the result.
describe('getStats', () => {
  it('forwards the inbox snapshot and tasks through to the shared summary', () => {
    const task = makeTask({
      status: 'needs_review',
      internal_state: null,
      disposition: null,
      error: null,
    });

    const stats = getStats(makeInbox(makeThread(), task), 'session-1');

    expect(stats.queueCount).toBe(1);
    expect(stats.needsReviewCount).toBe(1);
    expect(stats.assessableCount).toBe(1);
  });

  it('treats a null inbox (never loaded) as no snapshot and no tasks', () => {
    const stats = getStats(null, 'session-1');

    expect(stats.queueCount).toBe(0);
    expect(stats.retryableAttentionTaskIds).toEqual([]);
  });
});
