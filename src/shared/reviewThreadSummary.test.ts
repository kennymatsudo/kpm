import { describe, expect, it } from 'vitest';
import type { PrReviewSnapshot, PrReviewThread, ReviewTask } from './types';
import { summarizeReviewThreads } from './reviewThreadSummary';

const NOW = '2026-01-01T00:00:00.000Z';

function makeThread(id: string, overrides: Partial<PrReviewThread> = {}): PrReviewThread {
  return {
    id,
    url: `https://github.com/acme/repo/pull/42#${id}`,
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

function makeTask(id: string, threadId: string, overrides: Partial<ReviewTask> = {}): ReviewTask {
  return {
    id,
    project_id: 'project-1',
    repo_id: 'repo-1',
    session_id: 'session-1',
    pr_number: 42,
    thread_id: threadId,
    thread_url: `https://github.com/acme/repo/pull/42#${threadId}`,
    path: 'src/file.ts',
    line: 10,
    source: 'human',
    status: 'needs_review',
    internal_state: null,
    disposition: null,
    rationale: null,
    draft_reply: null,
    priority: 'high',
    title: 'Review feedback',
    latest_comment_preview: 'Please fix this',
    last_seen_comment_id: 'comment-1',
    last_seen_updated_at: NOW,
    last_agent_run_at: null,
    last_posted_reply_id: null,
    error: null,
    created_at: NOW,
    updated_at: NOW,
    completed_at: null,
    ...overrides,
  };
}

function makeSnapshot(threads: PrReviewThread[]): PrReviewSnapshot {
  return {
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
      totalThreads: threads.length,
      unresolvedThreads: 1,
      resolvedThreads: 1,
      outdatedThreads: 1,
      actionableThreads: 1,
      humanThreads: threads.length,
      botOnlyThreads: 0,
      topLevelReviewCount: 0,
      conversationCommentCount: 0,
    },
    threads,
    topLevelReviews: [],
    conversationComments: [],
  };
}

describe('summarizeReviewThreads', () => {
  it('filters resolved, outdated, done, ignored, and other-session tasks before deriving facts', () => {
    const summary = summarizeReviewThreads('session-1', {
      snapshot: makeSnapshot([
        makeThread('thread-open'),
        makeThread('thread-done'),
        makeThread('thread-ignored'),
        makeThread('thread-other-session'),
        makeThread('thread-resolved', { isResolved: true }),
        makeThread('thread-outdated', { isOutdated: true }),
      ]),
      tasks: [
        makeTask('task-open', 'thread-open'),
        makeTask('task-resolved', 'thread-resolved'),
        makeTask('task-outdated', 'thread-outdated'),
        makeTask('task-done', 'thread-done', { status: 'done' }),
        makeTask('task-ignored', 'thread-ignored', { internal_state: 'ignored' }),
        makeTask('task-other-session', 'thread-other-session', { session_id: 'session-2' }),
      ],
    });

    expect(summary.attention).toEqual({
      sessionId: 'session-1',
      hasActionable: false,
      counts: { needsInput: 0, failed: 0, stale: 0, errored: 0 },
    });
    expect(summary.work.queueCount).toBe(1);
    expect(summary.work.openThreadCount).toBe(4);
    expect(summary.work.closedThreadCount).toBe(2);
    expect(summary.work.needsReviewCount).toBe(1);
  });

  it('classifies each attention task once using the existing attention precedence', () => {
    const summary = summarizeReviewThreads('session-1', {
      snapshot: null,
      tasks: [
        makeTask('task-input', 'thread-input', {
          status: 'assessed',
          disposition: 'needs_user_input',
          internal_state: 'failed',
          error: 'assessment failed',
        }),
        makeTask('task-failed', 'thread-failed', {
          status: 'assessed',
          internal_state: 'failed',
          error: 'assessment failed',
        }),
        makeTask('task-stale', 'thread-stale', {
          status: 'assessed',
          internal_state: 'stale',
          error: 'assessment failed',
        }),
        makeTask('task-error', 'thread-error', {
          status: 'assessed',
          error: 'assessment failed',
        }),
      ],
    });

    expect(summary.attention).toEqual({
      sessionId: 'session-1',
      hasActionable: true,
      counts: { needsInput: 1, failed: 1, stale: 1, errored: 1 },
    });
  });

  it('derives review-work counts independently from user-attention counts', () => {
    const summary = summarizeReviewThreads('session-1', {
      snapshot: null,
      tasks: [
        makeTask('task-new', 'thread-new'),
        makeTask('task-fix', 'thread-fix', { status: 'assessed', disposition: 'implement' }),
        makeTask('task-updating', 'thread-updating', {
          status: 'in_progress',
          disposition: 'implement',
          internal_state: 'implementation_queued',
        }),
        makeTask('task-reply', 'thread-reply', { status: 'ready_to_post', disposition: 'push_back' }),
        makeTask('task-input', 'thread-input', {
          status: 'assessed',
          disposition: 'needs_user_input',
        }),
        makeTask('task-failed', 'thread-failed', {
          status: 'assessed',
          disposition: 'push_back',
          internal_state: 'failed',
        }),
        makeTask('task-stale', 'thread-stale', {
          status: 'assessed',
          disposition: 'push_back',
          internal_state: 'stale',
        }),
        makeTask('task-error', 'thread-error', {
          status: 'assessed',
          disposition: 'push_back',
          error: 'assessment failed',
        }),
        makeTask('task-assessed', 'thread-assessed', {
          status: 'assessed',
          disposition: 'push_back',
        }),
      ],
    });

    expect(summary.attention.counts).toEqual({
      needsInput: 1,
      failed: 1,
      stale: 1,
      errored: 1,
    });
    expect(summary.work).toEqual({
      queueCount: 8,
      openThreadCount: 0,
      closedThreadCount: 0,
      needsReviewCount: 1,
      implementCount: 1,
      inProgressImplCount: 1,
      readyToPostTasks: [expect.objectContaining({ id: 'task-reply' })],
      needsInputCount: 1,
      failedCount: 2,
      staleCount: 1,
      assessableCount: 8,
      queuedCodeCount: 1,
      updatingCodeCount: 1,
      retryableAttentionTaskIds: ['task-failed', 'task-stale', 'task-error'],
    });
  });
});
