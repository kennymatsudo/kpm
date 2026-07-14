import { describe, expect, it } from 'vitest';
import type { PrReviewThread, PrTopLevelReview, ReviewTask } from '../../../shared/types';
import type { ReviewStats } from './reviewStats';
import {
  buildReviewReplyProposal,
  canReassessTask,
  deriveNextAction,
  getThreadLocation,
  getThreadPill,
  getThreadRailClass,
  isAddressingReview,
  sortThreads,
  summarizeReviewers,
} from './reviewActions';

function makeTask(overrides: Partial<ReviewTask> = {}): ReviewTask {
  return {
    id: 'task-1',
    project_id: 'proj-1',
    repo_id: 'repo-1',
    session_id: 'session-1',
    pr_number: 1,
    thread_id: 'thread-1',
    thread_url: 'https://github.com/x/y/pull/1#discussion_r1',
    path: 'src/a.ts',
    line: 10,
    source: 'line_comment' as ReviewTask['source'],
    status: 'needs_review',
    internal_state: null,
    disposition: null,
    rationale: null,
    draft_reply: null,
    priority: 'medium',
    title: 'Fix the thing',
    latest_comment_preview: null,
    last_seen_comment_id: null,
    last_seen_updated_at: '2026-01-01T00:00:00Z',
    last_agent_run_at: null,
    last_posted_reply_id: null,
    error: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    completed_at: null,
    ...overrides,
  };
}

function makeThread(overrides: Partial<PrReviewThread> = {}): PrReviewThread {
  return {
    id: 'thread-1',
    url: 'https://github.com/x/y/pull/1#discussion_r1',
    path: 'src/a.ts',
    line: 10,
    startLine: null,
    subjectType: null,
    diffSide: null,
    isResolved: false,
    isOutdated: false,
    resolvedBy: null,
    updatedAt: '2026-01-02T00:00:00Z',
    participants: ['alice'],
    comments: [],
    hasBotOnlyComments: false,
    hasHumanReviewerComment: true,
    latestCommentPreview: null,
    ...overrides,
  };
}

function makeReview(overrides: Partial<PrTopLevelReview> = {}): PrTopLevelReview {
  return {
    id: 'review-1',
    databaseId: null,
    url: 'https://github.com/x/y/pull/1#pullrequestreview-1',
    author: 'alice',
    authorType: 'User',
    authorAssociation: null,
    body: '',
    state: 'COMMENTED',
    submittedAt: '2026-01-01T00:00:00Z',
    commitOid: null,
    ...overrides,
  };
}

function makeStats(overrides: Partial<ReviewStats> = {}): ReviewStats {
  return {
    queueCount: 0,
    openThreadCount: 0,
    closedThreadCount: 0,
    needsReviewCount: 0,
    implementCount: 0,
    inProgressImplCount: 0,
    readyToPostTasks: [],
    needsInputCount: 0,
    failedCount: 0,
    staleCount: 0,
    assessableCount: 0,
    queuedCodeCount: 0,
    updatingCodeCount: 0,
    retryableAttentionTaskIds: [],
    ...overrides,
  };
}

describe('canReassessTask', () => {
  it('rejects missing task or thread', () => {
    expect(canReassessTask(undefined, makeThread())).toBe(false);
    expect(canReassessTask(makeTask(), undefined)).toBe(false);
  });

  it('rejects closed threads and ignored tasks', () => {
    expect(canReassessTask(makeTask({ status: 'assessed' }), makeThread({ isResolved: true }))).toBe(false);
    expect(
      canReassessTask(
        makeTask({ status: 'assessed', internal_state: 'ignored' as ReviewTask['internal_state'] }),
        makeThread(),
      ),
    ).toBe(false);
  });

  it('allows assessed and ready_to_post tasks', () => {
    expect(canReassessTask(makeTask({ status: 'assessed' }), makeThread())).toBe(true);
    expect(canReassessTask(makeTask({ status: 'ready_to_post' }), makeThread())).toBe(true);
  });

  it('allows needs_review tasks only when failed, stale, or errored', () => {
    expect(canReassessTask(makeTask({ status: 'needs_review' }), makeThread())).toBe(false);
    expect(
      canReassessTask(
        makeTask({ status: 'needs_review', internal_state: 'failed' as ReviewTask['internal_state'] }),
        makeThread(),
      ),
    ).toBe(true);
    expect(canReassessTask(makeTask({ status: 'needs_review', error: 'boom' }), makeThread())).toBe(true);
  });

  it('rejects in_progress and done tasks', () => {
    expect(canReassessTask(makeTask({ status: 'in_progress' }), makeThread())).toBe(false);
    expect(canReassessTask(makeTask({ status: 'done' }), makeThread())).toBe(false);
  });
});

describe('sortThreads', () => {
  it('puts tasked threads before untasked ones', () => {
    const tasked = makeThread({ id: 't-a' });
    const untasked = makeThread({ id: 't-b' });
    const taskMap = new Map([['t-a', makeTask({ thread_id: 't-a' })]]);
    expect(sortThreads(tasked, untasked, taskMap)).toBeLessThan(0);
    expect(sortThreads(untasked, tasked, taskMap)).toBeGreaterThan(0);
  });

  it('orders by task status, then priority, then recency', () => {
    const a = makeThread({ id: 't-a', updatedAt: '2026-01-01T00:00:00Z' });
    const b = makeThread({ id: 't-b', updatedAt: '2026-01-03T00:00:00Z' });

    const byStatus = new Map([
      ['t-a', makeTask({ thread_id: 't-a', status: 'done' })],
      ['t-b', makeTask({ thread_id: 't-b', status: 'needs_review' })],
    ]);
    expect(sortThreads(a, b, byStatus)).toBeGreaterThan(0);

    const byPriority = new Map([
      ['t-a', makeTask({ thread_id: 't-a', priority: 'low' as ReviewTask['priority'] })],
      ['t-b', makeTask({ thread_id: 't-b', priority: 'high' as ReviewTask['priority'] })],
    ]);
    expect(sortThreads(a, b, byPriority)).toBeGreaterThan(0);

    const tie = new Map([
      ['t-a', makeTask({ thread_id: 't-a' })],
      ['t-b', makeTask({ thread_id: 't-b' })],
    ]);
    expect(sortThreads(a, b, tie)).toBeGreaterThan(0); // b is newer, sorts first
  });
});

describe('getThreadRailClass', () => {
  it('prioritizes thread closure over task state', () => {
    expect(getThreadRailClass(makeTask({ error: 'x' }), makeThread({ isResolved: true }))).toBe('bg-success/55');
    expect(getThreadRailClass(undefined, makeThread({ isOutdated: true }))).toBe('bg-text-tertiary/50');
  });

  it('maps task states to rails', () => {
    expect(getThreadRailClass(undefined, makeThread())).toBe('bg-border-default');
    expect(getThreadRailClass(makeTask({ error: 'boom' }), makeThread())).toBe('bg-danger');
    expect(
      getThreadRailClass(makeTask({ internal_state: 'stale' as ReviewTask['internal_state'] }), makeThread()),
    ).toBe('bg-warning');
    expect(
      getThreadRailClass(makeTask({ disposition: 'needs_user_input' }), makeThread()),
    ).toBe('bg-info');
    expect(getThreadRailClass(makeTask({ status: 'ready_to_post' }), makeThread())).toBe('bg-accent');
    expect(getThreadRailClass(makeTask({ disposition: 'push_back' }), makeThread())).toBe('bg-warning');
  });
});

describe('getThreadPill', () => {
  it('shows closure state first', () => {
    expect(getThreadPill(undefined, makeThread({ isResolved: true }))).toEqual({
      label: 'Resolved',
      variant: 'success',
    });
  });

  it('returns null for open threads without a task', () => {
    expect(getThreadPill(undefined, makeThread())).toBeNull();
  });

  it('maps task states to pills', () => {
    expect(getThreadPill(makeTask({ error: 'boom' }), makeThread())).toEqual({
      label: 'Needs attention',
      variant: 'danger',
    });
    expect(getThreadPill(makeTask({ status: 'needs_review' }), makeThread())).toEqual({
      label: 'To assess',
      variant: 'warning',
    });
    expect(getThreadPill(makeTask({ status: 'done' }), makeThread())).toEqual({
      label: 'Done',
      variant: 'default',
    });
  });
});

describe('summarizeReviewers', () => {
  it('keeps only the latest verdict per reviewer, newest first', () => {
    const verdicts = summarizeReviewers([
      makeReview({ id: 'r1', author: 'bot', state: 'CHANGES_REQUESTED', submittedAt: '2026-01-01T00:00:00Z' }),
      makeReview({ id: 'r2', author: 'bot', state: 'APPROVED', submittedAt: '2026-01-03T00:00:00Z' }),
      makeReview({ id: 'r3', author: 'alice', state: 'COMMENTED', submittedAt: '2026-01-02T00:00:00Z' }),
    ]);
    expect(verdicts).toHaveLength(2);
    expect(verdicts[0]).toMatchObject({ author: 'bot', state: 'APPROVED' });
    expect(verdicts[1]).toMatchObject({ author: 'alice', state: 'COMMENTED' });
  });
});

describe('isAddressingReview', () => {
  it('is true while the session is in addressing_review phase', () => {
    expect(isAddressingReview(makeStats(), 'addressing_review', 'active')).toBe(true);
  });

  it('is true when code updates are queued or running on an active session', () => {
    expect(isAddressingReview(makeStats({ queuedCodeCount: 1 }), 'idle', 'inactive')).toBe(true);
    expect(isAddressingReview(makeStats({ updatingCodeCount: 1 }), 'idle', 'active')).toBe(true);
    expect(isAddressingReview(makeStats({ updatingCodeCount: 1 }), 'idle', 'inactive')).toBe(false);
  });
});

describe('deriveNextAction', () => {
  const baseInputs = {
    stats: makeStats(),
    assessmentPending: null,
    addressingReview: false,
    isOwner: true,
    ownerTitle: undefined,
  };

  it('returns null when there is nothing to do', () => {
    expect(deriveNextAction(baseInputs)).toBeNull();
  });

  it('reports a running assessment above everything else', () => {
    const action = deriveNextAction({
      ...baseInputs,
      stats: makeStats({ failedCount: 2, needsReviewCount: 3 }),
      assessmentPending: { taskIds: ['a', 'b'], scope: 'all' },
    });
    expect(action).toMatchObject({ kind: 'assessment-running', tone: 'accent', busy: true });
    expect(action?.text).toContain('Reassessing');
    expect(action?.text).toContain('2 review tasks');
  });

  it('labels queue-scoped assessment as assessing', () => {
    const action = deriveNextAction({
      ...baseInputs,
      assessmentPending: { taskIds: [], scope: 'queue' },
    });
    expect(action?.text).toContain('Assessing');
  });

  it('reports code updates in flight', () => {
    const action = deriveNextAction({
      ...baseInputs,
      stats: makeStats({ queuedCodeCount: 2 }),
      addressingReview: true,
    });
    expect(action).toMatchObject({ kind: 'updating-code', busy: true });
    expect(action?.text).toContain('2 tasks queued');
  });

  it('surfaces failed and stale tasks with a reassess button', () => {
    const action = deriveNextAction({
      ...baseInputs,
      stats: makeStats({ failedCount: 1, staleCount: 1, retryableAttentionTaskIds: ['t1'] }),
    });
    expect(action).toMatchObject({ kind: 'needs-attention', tone: 'danger' });
    expect(action?.button).toMatchObject({ label: 'Reassess', actionKey: 'assess-attention', disabled: false });
  });

  it('disables the reassess button when nothing is retryable', () => {
    const action = deriveNextAction({
      ...baseInputs,
      stats: makeStats({ failedCount: 1 }),
    });
    expect(action?.button?.disabled).toBe(true);
    expect(action?.button?.title).toBe('No assessable tasks to retry');
  });

  it('offers post-all only when drafts are the sole remaining work', () => {
    const drafts = [makeTask({ status: 'ready_to_post' })];
    const ready = deriveNextAction({ ...baseInputs, stats: makeStats({ readyToPostTasks: drafts }) });
    expect(ready).toMatchObject({ kind: 'post-drafted-replies' });
    expect(ready?.text).toBe('Post 1 drafted reply');

    const blocked = deriveNextAction({
      ...baseInputs,
      stats: makeStats({ readyToPostTasks: drafts, needsInputCount: 1 }),
    });
    expect(blocked?.kind).not.toBe('post-drafted-replies');
  });

  it('reports decisions that need the user without a button', () => {
    const action = deriveNextAction({ ...baseInputs, stats: makeStats({ needsInputCount: 2 }) });
    expect(action).toMatchObject({ kind: 'decisions-need-you', tone: 'info' });
    expect(action?.button).toBeUndefined();
  });

  it('offers address-all when fixes are ready and nothing needs assessment', () => {
    const action = deriveNextAction({ ...baseInputs, stats: makeStats({ implementCount: 3 }) });
    expect(action).toMatchObject({ kind: 'fixes-ready' });
    expect(action?.button).toMatchObject({ label: 'Address all', actionKey: 'address' });
  });

  it('offers drafting replies for addressed threads', () => {
    const action = deriveNextAction({ ...baseInputs, stats: makeStats({ inProgressImplCount: 1 }) });
    expect(action).toMatchObject({ kind: 'draft-replies', tone: 'neutral' });
    expect(action?.button).toMatchObject({ label: 'Draft replies', actionKey: 'draft' });
  });

  it('offers assessment for new threads', () => {
    const action = deriveNextAction({ ...baseInputs, stats: makeStats({ needsReviewCount: 4 }) });
    expect(action).toMatchObject({ kind: 'assess-new', tone: 'warning' });
    expect(action?.button).toMatchObject({ label: 'Assess', actionKey: 'assess' });
  });

  it('disables owner-gated buttons for non-owners', () => {
    const title = 'Only the agent session that owns this review can act on it';
    const action = deriveNextAction({
      ...baseInputs,
      stats: makeStats({ implementCount: 1 }),
      isOwner: false,
      ownerTitle: title,
    });
    expect(action?.button).toMatchObject({ disabled: true, title });
  });
});

describe('getThreadLocation', () => {
  it('formats path and line together', () => {
    expect(getThreadLocation(makeThread({ path: 'src/a.ts', line: 42 }))).toBe('src/a.ts:42');
  });

  it('falls back to the path alone when there is no line', () => {
    expect(getThreadLocation(makeThread({ path: 'src/a.ts', line: null }))).toBe('src/a.ts');
  });

  it('returns General when the thread has no path', () => {
    expect(getThreadLocation(makeThread({ path: null, line: null }))).toBe('General');
  });
});

describe('buildReviewReplyProposal', () => {
  it('maps every field of the review-reply proposal', () => {
    const thread = makeThread({
      url: 'https://github.com/x/y/pull/3#discussion_r9',
      path: 'src/b.ts',
      line: 7,
      latestCommentPreview: 'please rename this',
    });
    const proposal = buildReviewReplyProposal({
      session: { id: 'session-9', project_id: 'proj-9' },
      thread,
      threadId: 'thread-9',
      title: 'Rename the variable',
      body: 'Done in the latest push.',
      resolve: true,
    });

    expect(proposal).toEqual({
      type: 'review-reply',
      projectId: 'proj-9',
      sessionId: 'session-9',
      threadId: 'thread-9',
      threadUrl: 'https://github.com/x/y/pull/3#discussion_r9',
      threadTitle: 'Rename the variable',
      threadLocation: getThreadLocation(thread),
      latestCommentPreview: 'please rename this',
      body: 'Done in the latest push.',
      resolve: true,
    });
  });

  it('derives threadLocation from the thread, not the caller', () => {
    const thread = makeThread({ path: 'src/c.ts', line: 123 });
    const proposal = buildReviewReplyProposal({
      session: { id: 's', project_id: 'p' },
      thread,
      threadId: 't',
      title: 'anything',
      body: 'reply',
      resolve: false,
    });
    expect(proposal.threadLocation).toBe(getThreadLocation(thread));
    expect(proposal.threadLocation).toBe('src/c.ts:123');
  });

  it('passes the caller-supplied title through verbatim', () => {
    const proposal = buildReviewReplyProposal({
      session: { id: 's', project_id: 'p' },
      thread: makeThread(),
      threadId: 't',
      title: 'Caller decides the title',
      body: 'reply',
      resolve: false,
    });
    expect(proposal.threadTitle).toBe('Caller decides the title');
  });
});
