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

describe('getStats', () => {
  it('counts a new open Review Thread as review work without requiring user attention', () => {
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
    expect(stats.needsInputCount).toBe(0);
    expect(stats.failedCount).toBe(0);
    expect(stats.staleCount).toBe(0);
  });

  it('ignores attention tasks whose live thread is resolved', () => {
    const stats = getStats(makeInbox(makeThread({ isResolved: true }), makeTask()), 'session-1');

    expect(stats.queueCount).toBe(0);
    expect(stats.failedCount).toBe(0);
    expect(stats.staleCount).toBe(0);
    expect(stats.needsInputCount).toBe(0);
    expect(stats.assessableCount).toBe(0);
    expect(stats.retryableAttentionTaskIds).toEqual([]);
  });

  it('ignores attention tasks whose live thread is outdated', () => {
    const stats = getStats(makeInbox(makeThread({ isOutdated: true }), makeTask()), 'session-1');

    expect(stats.queueCount).toBe(0);
    expect(stats.staleCount).toBe(0);
    expect(stats.retryableAttentionTaskIds).toEqual([]);
  });

  it('falls back to persisted task state when no live snapshot is available', () => {
    const stats = getStats(makeInbox(null, makeTask()), 'session-1');

    expect(stats.queueCount).toBe(1);
    expect(stats.failedCount).toBe(1);
    expect(stats.staleCount).toBe(1);
    expect(stats.needsInputCount).toBe(1);
    expect(stats.retryableAttentionTaskIds).toEqual(['task-1']);
  });
});
