import { describe, expect, it, vi } from 'vitest';
import type { DevSession, ReviewTask } from '../../../shared/types';
import { createReviewService } from './ReviewService';

function createSession(): DevSession {
  return {
    id: 'session-1',
    project_id: 'project-1',
    plan_item_id: 'plan-1',
    repo_id: 'repo-1',
    name: 'Review session',
    worktree_path: '/tmp/worktree',
    branch_name: 'feature/test',
    base_branch: 'main',
    base_sha: null,
    status: 'inactive',
    agent_type: 'claude',
    review_policy: 'auto',
    automation_phase: null,
    playbook_id: null,
    playbook_snapshot: null,
    current_step_id: null,
    step_pass_counts: null,
    paused_reason: null,
    initial_instructions: 'Do the work',
    work_brief_revision: 1,
    pr_number: 42,
    pr_url: 'https://github.com/acme/repo/pull/42',
    pr_state: 'OPEN',
    review_state: 'CHANGES_REQUESTED',
    merge_order: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    completed_at: null,
  };
}

function createTask(overrides: Partial<ReviewTask> = {}): ReviewTask {
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
    internal_state: null,
    disposition: 'implement',
    rationale: 'Worth fixing',
    draft_reply: null,
    priority: 'high',
    title: 'Review feedback on src/file.ts:10',
    latest_comment_preview: 'Please fix this',
    last_seen_comment_id: 'comment-1',
    last_seen_updated_at: '2026-01-01T00:00:00.000Z',
    last_agent_run_at: null,
    last_posted_reply_id: null,
    error: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    completed_at: null,
    ...overrides,
  };
}

function createService(tasks: ReviewTask[]) {
  const session = createSession();
  return createReviewService({
    devSessions: {
      get: vi.fn(() => session),
    },
    reviewTasks: {
      getByRepoPr: vi.fn(() => tasks),
      updateStatus: vi.fn((id: string, status: ReviewTask['status'], meta?: Partial<ReviewTask>) => {
        const task = tasks.find((candidate) => candidate.id === id);
        if (!task) return undefined;
        Object.assign(task, { status, ...meta });
        return task;
      }),
    },
    reviewOwnership: {
      get: vi.fn(),
      set: vi.fn(),
    },
    reviewSyncState: {
      get: vi.fn(),
      upsert: vi.fn(),
      updateError: vi.fn(),
    },
    gitHubService: {},
    devSessionService: {},
  } as never);
}

function createReviewSnapshot() {
  return {
    prNumber: 42,
    prUrl: 'https://github.com/acme/repo/pull/42',
    title: 'Review PR',
    state: 'OPEN',
    reviewDecision: 'CHANGES_REQUESTED',
    headOid: 'head-sha',
    baseRefName: 'main',
    headRefName: 'feature/test',
    fetchedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    summary: {
      totalThreads: 1,
      unresolvedThreads: 1,
      resolvedThreads: 0,
      outdatedThreads: 0,
      actionableThreads: 1,
      humanThreads: 1,
      botOnlyThreads: 0,
      topLevelReviewCount: 0,
      conversationCommentCount: 0,
    },
    threads: [{
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
      updatedAt: '2026-01-01T00:00:00.000Z',
      participants: ['reviewer'],
      comments: [{
        id: 'comment-1',
        databaseId: 1,
        url: 'https://github.com/acme/repo/pull/42#discussion_r1',
        author: 'reviewer',
        authorType: 'User',
        authorAssociation: 'MEMBER',
        body: 'Please fix this',
        createdAt: '2026-01-01T00:00:00.000Z',
        replyToId: null,
        viewerCanUpdate: false,
        viewerCanDelete: false,
      }],
      hasBotOnlyComments: false,
      hasHumanReviewerComment: true,
      latestCommentPreview: 'Please fix this',
    }],
    topLevelReviews: [],
    conversationComments: [],
  };
}

function createServiceHarness(tasks: ReviewTask[], sessionOverrides: Partial<DevSession> = {}) {
  const session = createSession();
  Object.assign(session, sessionOverrides);
  const syncState = {
    repo_id: session.repo_id,
    pr_number: session.pr_number!,
    session_id: session.id,
    last_fetched_at: '2026-01-01T00:00:00.000Z',
    last_successful_fetched_at: '2026-01-01T00:00:00.000Z',
    last_head_oid: 'head-sha',
    last_review_decision: 'CHANGES_REQUESTED',
    last_pr_updated_at: '2026-01-01T00:00:00.000Z',
    probe_digest: 'digest',
    last_error: null,
  };
  const ownership = {
    repo_id: session.repo_id,
    pr_number: session.pr_number!,
    session_id: session.id,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
  const gitHubService = {
    getPrReviewSnapshot: vi.fn().mockResolvedValue({ ok: true, data: createReviewSnapshot() }),
    buildAddressReviewContext: vi.fn().mockResolvedValue({ ok: true, data: 'THREAD thread-1' }),
  };
  const devSessionService = {
    sendAgentFollowUp: vi.fn().mockResolvedValue({ ok: true, data: { restarted: false } }),
  };
  const phaseMachine = { transition: vi.fn() };
  const reviewTasks = {
    getByRepoPr: vi.fn(() => tasks),
    updateStatus: vi.fn((id: string, status: ReviewTask['status'], meta?: Partial<ReviewTask>) => {
      const task = tasks.find((candidate) => candidate.id === id);
      if (!task) return undefined;
      Object.assign(task, { status, ...meta });
      return task;
    }),
    upsertTask: vi.fn((next: ReviewTask) => {
      const existing = tasks.find((candidate) => candidate.id === next.id || candidate.thread_id === next.thread_id);
      if (existing) {
        Object.assign(existing, next);
        return existing;
      }
      tasks.push(next);
      return next;
    }),
    markResolvedByThread: vi.fn(),
  };
  const service = createReviewService({
    devSessions: {
      get: vi.fn(() => session),
      getByProject: vi.fn(() => [session]),
    },
    reviewTasks,
    reviewOwnership: {
      get: vi.fn(() => ownership),
      set: vi.fn(() => ownership),
    },
    reviewSyncState: {
      get: vi.fn(() => syncState),
      upsert: vi.fn(() => syncState),
      updateError: vi.fn(),
    },
    gitHubService,
    devSessionService,
    phaseMachine,
  } as never);

  return { service, gitHubService, devSessionService, phaseMachine, reviewTasks };
}

describe('ReviewService', () => {
  it('queues assessed implement tasks for review automation', () => {
    const task = createTask();
    const service = createService([task]);

    const result = service.queueReviewTasks('session-1', [task.id]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: task.id,
      status: 'in_progress',
      internal_state: 'implementation_queued',
    });
  });

  it('does not queue assessed push-back tasks without implementation work', () => {
    const task = createTask({
      disposition: 'push_back',
      draft_reply: null,
    });
    const service = createService([task]);

    const result = service.queueReviewTasks('session-1', [task.id]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(0);
    expect(task.status).toBe('assessed');
  });

  it('queues address requests without sending a follow-up while the dev session is active', async () => {
    const task = createTask();
    const { service, gitHubService, devSessionService, phaseMachine } = createServiceHarness([task], { status: 'active' });

    const result = await service.triggerReviewAutomation('session-1', [task.id]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ taskIds: [task.id], context: '' });
    expect(task).toMatchObject({
      status: 'in_progress',
      internal_state: 'implementation_queued',
    });
    expect(phaseMachine.transition).toHaveBeenCalledWith('session-1', { type: 'prReviewThreadsQueued' });
    expect(gitHubService.buildAddressReviewContext).not.toHaveBeenCalled();
    expect(devSessionService.sendAgentFollowUp).not.toHaveBeenCalled();
  });

  it('flushes queued address requests as one merged follow-up', async () => {
    const first = createTask({
      id: 'task-1',
      status: 'in_progress',
      internal_state: 'implementation_queued',
    });
    const second = createTask({
      id: 'task-2',
      thread_id: 'thread-2',
      status: 'in_progress',
      internal_state: 'implementation_queued',
    });
    const { service, gitHubService, devSessionService } = createServiceHarness([first, second]);

    const result = await service.flushQueuedReviewTasks('session-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.taskIds).toEqual(['task-1', 'task-2']);
    expect(gitHubService.buildAddressReviewContext).toHaveBeenCalledWith('session-1', {
      threadIds: ['thread-1', 'thread-2'],
    });
    expect(devSessionService.sendAgentFollowUp).toHaveBeenCalledTimes(1);
    expect(first.internal_state).toBeNull();
    expect(second.internal_state).toBeNull();
  });

  it('marks outdated review tasks done during sync instead of leaving stale attention', async () => {
    const task = createTask({
      status: 'assessed',
      internal_state: 'stale',
      error: 'Previous assessment failed',
    });
    const snapshot = createReviewSnapshot();
    snapshot.summary = {
      ...snapshot.summary,
      unresolvedThreads: 0,
      outdatedThreads: 1,
      actionableThreads: 0,
    };
    snapshot.threads = snapshot.threads.map((thread) => ({
      ...thread,
      isOutdated: true,
    }));
    const { service, gitHubService, reviewTasks } = createServiceHarness([task]);
    gitHubService.getPrReviewSnapshot.mockResolvedValue({ ok: true, data: snapshot });

    const result = await service.syncSessionReviewState('session-1');

    expect(result.ok).toBe(true);
    expect(reviewTasks.updateStatus).toHaveBeenCalledWith(task.id, 'done', {
      internal_state: null,
      error: null,
      completed_at: snapshot.fetchedAt,
    });
  });
});
