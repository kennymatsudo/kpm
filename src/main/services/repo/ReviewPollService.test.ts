import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DevSession,
  PlanItem,
  PrReviewSnapshot,
  PrReviewThread,
  ReviewInboxSnapshot,
  ReviewTask,
} from '../../../shared/types';
import { createReviewPollService } from './ReviewPollService';

vi.mock('../../config', () => ({
  getConfig: () => ({
    reviewPoll: {
      enabled: true,
      pollIntervalMs: 30_000,
      minPerSessionIntervalMs: 0,
      maxSessionsPerTick: 10,
      maxQuietSkipTicks: 8,
      errorBackoffTicks: 2,
    },
    agentSession: {
      maxConcurrentSessionsPerProject: 4,
    },
  }),
}));

const NOW = '2026-01-01T00:00:00.000Z';

function createSession(overrides: Partial<DevSession> = {}): DevSession {
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
    automation_phase: 'ready_for_review',
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
    review_state: 'APPROVED',
    merge_order: null,
    created_at: NOW,
    updated_at: NOW,
    completed_at: null,
    ...overrides,
  };
}

function createPlanItem(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: 'plan-1',
    project_id: 'project-1',
    parent_id: null,
    title: 'Ship the thing',
    description: null,
    intent: null,
    acceptance_criteria: null,
    work_brief_revision: 1,
    source_document_id: null,
    label: 'task',
    item_order: 0,
    code_refs: null,
    status: 'planned',
    release_tag: null,
    position_x: null,
    position_y: null,
    group_id: null,
    association_id: null,
    external_key: null,
    external_id: null,
    external_type: null,
    external_issue_type: null,
    external_status: null,
    status_category: 'in_review',
    external_url: null,
    external_parent_key: null,
    external_epic_key: null,
    sync_source: 'local',
    last_synced_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
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
    status: 'needs_review',
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
    error: 'Previous failure',
    created_at: NOW,
    updated_at: NOW,
    completed_at: null,
    ...overrides,
  };
}

function createSnapshot(overrides: Partial<PrReviewSnapshot> = {}): PrReviewSnapshot {
  return {
    prNumber: 42,
    prUrl: 'https://github.com/acme/repo/pull/42',
    title: 'Review PR',
    state: 'MERGED',
    reviewDecision: 'APPROVED',
    headOid: 'head-sha',
    baseRefName: 'main',
    headRefName: 'feature/test',
    updatedAt: NOW,
    fetchedAt: NOW,
    summary: {
      totalThreads: 0,
      unresolvedThreads: 0,
      resolvedThreads: 0,
      outdatedThreads: 0,
      actionableThreads: 0,
      humanThreads: 0,
      botOnlyThreads: 0,
      topLevelReviewCount: 0,
      conversationCommentCount: 0,
    },
    threads: [],
    topLevelReviews: [],
    conversationComments: [],
    ...overrides,
  };
}

function createThread(overrides: Partial<PrReviewThread> = {}): PrReviewThread {
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

function createInbox(snapshot: PrReviewSnapshot | null, tasks: ReviewTask[]): ReviewInboxSnapshot {
  return {
    session_id: 'session-1',
    snapshot,
    tasks,
    ownership: null,
    sync_state: null,
    fetched_at: NOW,
  };
}

function buildHarness(options: {
  session?: DevSession;
  planItem?: PlanItem;
  snapshot?: PrReviewSnapshot | null;
  tasks?: ReviewTask[];
  latestSession?: DevSession;
} = {}) {
  const session = options.session ?? createSession();
  const planItem = options.planItem ?? createPlanItem();
  const tasks = options.tasks ?? [createTask()];
  const snapshot = options.snapshot === undefined ? createSnapshot() : options.snapshot;
  const latestSession = options.latestSession ?? session;

  const reviewTasks = {
    getByRepoPr: vi.fn(() => tasks),
    updateStatus: vi.fn((id: string, status: ReviewTask['status'], meta?: Partial<ReviewTask>) => {
      const task = tasks.find((candidate) => candidate.id === id);
      if (!task) return undefined;
      Object.assign(task, { status, ...meta });
      return task;
    }),
  };
  const reviewService = {
    syncSessionReviewState: vi.fn().mockResolvedValue({ ok: true, data: createInbox(snapshot, tasks) }),
    queueReviewTasks: vi.fn((_sessionId: string, taskIds: string[]) => {
      for (const taskId of taskIds) {
        const task = tasks.find((candidate) => candidate.id === taskId);
        if (task) {
          task.status = 'in_progress';
          task.internal_state = 'implementation_queued';
        }
      }
      return { ok: true, data: undefined };
    }),
  };
  const reviewAssessmentService = {
    assessThreads: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  };
  const gitHubService = {
    getPrStatus: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        number: 42,
        url: 'https://github.com/acme/repo/pull/42',
        state: 'MERGED',
        reviewDecision: 'APPROVED',
        baseRefName: 'main',
        checksStatus: 'SUCCESS',
        additions: 1,
        deletions: 0,
        mergeable: 'MERGEABLE',
      },
    }),
    buildAddressReviewContext: vi.fn().mockResolvedValue({ ok: true, data: 'REVIEW CONTEXT' }),
  };
  const devSessionService = {
    sendAgentFollowUp: vi.fn().mockResolvedValue({ ok: true, data: { restarted: false, deferred: false } }),
  };
  const planService = {
    updateItem: vi.fn().mockReturnValue({ ok: true, data: undefined }),
  };
  const broadcastToWindows = vi.fn();
  const requestPlanRefresh = vi.fn();
  const eventBus = {
    emit: vi.fn(),
  };
  const phaseMachine = { transition: vi.fn() };

  const service = createReviewPollService({
    projects: {
      list: vi.fn(() => [{ id: 'project-1' }]),
    },
    devSessions: {
      get: vi.fn(() => session),
      getByProject: vi.fn(() => [session]),
      getByPlanItem: vi.fn(() => latestSession),
    },
    planItems: {
      get: vi.fn((id: string) => id === planItem.id ? planItem : undefined),
    },
    reviewTasks,
    reviewSyncState: {
      get: vi.fn(),
    },
    reviewService,
    reviewAssessmentService,
    devSessionService,
    phaseMachine,
    gitHubService,
    planService,
    agentSessionManager: {
      getByDevSession: vi.fn(() => null),
      getActiveCountForProject: vi.fn(() => 0),
    },
    broadcastToWindows,
    requestPlanRefresh,
    scheduler: {
      register: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    },
    eventBus,
  } as never);

  return {
    service,
    session,
    planItem,
    tasks,
    reviewTasks,
    reviewService,
    reviewAssessmentService,
    gitHubService,
    devSessionService,
    planService,
    phaseMachine,
    broadcastToWindows,
    requestPlanRefresh,
    eventBus,
  };
}

describe('ReviewPollService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('moves an in-review plan item to done when the linked PR is merged into main', async () => {
    const harness = buildHarness();

    const result = await harness.service.pollSession('session-1');

    expect(result.action).toBe('completed');
    expect(harness.planService.updateItem).toHaveBeenCalledWith('plan-1', { status_category: 'done' });
    expect(harness.reviewTasks.updateStatus).toHaveBeenCalledWith('task-1', 'done', expect.objectContaining({
      internal_state: null,
      error: null,
    }));
    expect(harness.reviewAssessmentService.assessThreads).not.toHaveBeenCalled();
    expect(harness.gitHubService.getPrStatus).not.toHaveBeenCalled();
    expect(harness.requestPlanRefresh).toHaveBeenCalledWith('project-1');
    expect(harness.eventBus.emit).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'pr_changed',
      change: 'merged',
      sessionId: 'session-1',
      prNumber: 42,
    }));
    expect(harness.broadcastToWindows).toHaveBeenCalledWith('review-poll:completed', expect.objectContaining({
      sessionId: 'session-1',
      planItemId: 'plan-1',
      prNumber: 42,
      baseRefName: 'main',
    }));
    expect(harness.broadcastToWindows).toHaveBeenCalledWith('review-poll:actionable', {
      sessionId: 'session-1',
      hasActionable: false,
      counts: { needsInput: 0, failed: 0, stale: 0, errored: 0 },
    });
  });

  it('moves a plan item to done on merge even if it never reached in_review', async () => {
    const harness = buildHarness({
      planItem: createPlanItem({ status_category: 'in_progress' }),
    });

    const result = await harness.service.pollSession('session-1');

    expect(result.action).toBe('completed');
    expect(harness.planService.updateItem).toHaveBeenCalledWith('plan-1', { status_category: 'done' });
  });

  it('does not resurrect done for a session superseded by newer work on the same plan item', async () => {
    const harness = buildHarness({
      planItem: createPlanItem({ status_category: 'in_progress' }),
      latestSession: createSession({ id: 'session-2', pr_number: null, pr_state: null }),
    });

    const result = await harness.service.pollSession('session-1');

    expect(result.action).not.toBe('completed');
    expect(harness.planService.updateItem).not.toHaveBeenCalled();
    expect(harness.eventBus.emit).not.toHaveBeenCalledWith(expect.objectContaining({ change: 'merged' }));
  });

  it('does not complete a merged PR targeting a non-main branch', async () => {
    const harness = buildHarness({
      snapshot: createSnapshot({ baseRefName: 'develop' }),
      tasks: [],
    });

    const result = await harness.service.pollSession('session-1');

    expect(result.action).toBe('synced');
    expect(harness.planService.updateItem).not.toHaveBeenCalled();
    expect(harness.eventBus.emit).not.toHaveBeenCalledWith(expect.objectContaining({ change: 'merged' }));
    expect(harness.requestPlanRefresh).not.toHaveBeenCalled();
  });

  it('does not broadcast actionable attention for closed live review threads', async () => {
    const harness = buildHarness({
      snapshot: createSnapshot({
        state: 'OPEN',
        reviewDecision: 'CHANGES_REQUESTED',
        summary: {
          totalThreads: 1,
          unresolvedThreads: 0,
          resolvedThreads: 1,
          outdatedThreads: 0,
          actionableThreads: 0,
          humanThreads: 1,
          botOnlyThreads: 0,
          topLevelReviewCount: 0,
          conversationCommentCount: 0,
        },
        threads: [createThread({ isResolved: true, resolvedBy: 'reviewer' })],
      }),
      tasks: [createTask({
        status: 'assessed',
        internal_state: 'stale',
        disposition: 'needs_user_input',
        error: 'Previous assessment failed',
      })],
    });

    const result = await harness.service.pollSession('session-1');

    expect(result.action).toBe('synced');
    expect(harness.broadcastToWindows).toHaveBeenCalledWith('review-poll:actionable', {
      sessionId: 'session-1',
      hasActionable: false,
      counts: { needsInput: 0, failed: 0, stale: 0, errored: 0 },
    });
  });

  it('broadcasts user-attention facts for open Review Threads', async () => {
    const harness = buildHarness({
      snapshot: createSnapshot({
        state: 'OPEN',
        reviewDecision: 'CHANGES_REQUESTED',
        threads: [createThread()],
      }),
      tasks: [createTask({
        status: 'assessed',
        internal_state: null,
        disposition: 'needs_user_input',
        error: null,
      })],
    });

    const result = await harness.service.pollSession('session-1');

    expect(result.action).toBe('synced');
    expect(harness.broadcastToWindows).toHaveBeenCalledWith('review-poll:actionable', {
      sessionId: 'session-1',
      hasActionable: true,
      counts: { needsInput: 1, failed: 0, stale: 0, errored: 0 },
    });
  });

  it('discovers and completes a session with a null automation_phase whose PR has already merged', async () => {
    // Every session is created with automation_phase: null and only flips to
    // 'idle' once its agent actually starts. A session whose PR was created
    // and merged without ever making that transition must still be eligible
    // for polling, or its cached pr_state/review_state go stale forever.
    const harness = buildHarness({
      session: createSession({ automation_phase: null }),
    });

    const summary = await harness.service.pollNow();

    expect(summary.processed).toBe(1);
    expect(summary.completed).toBe(1);
    expect(harness.planService.updateItem).toHaveBeenCalledWith('plan-1', { status_category: 'done' });
  });

  it('does not discover a custom-id playbook cursor that is live during provider resolution or dispatch', async () => {
    const harness = buildHarness({
      session: createSession({
        automation_phase: 'idle',
        playbook_snapshot: '{"id":"custom"}',
        current_step_id: 'critic-a',
      }),
    });

    const summary = await harness.service.pollNow();

    expect(summary.processed).toBe(0);
    expect(harness.reviewService.syncSessionReviewState).not.toHaveBeenCalled();
  });

  it('does not discover a session that is actively mid-automation', async () => {
    const harness = buildHarness({
      session: createSession({ automation_phase: 'addressing_review' }),
    });

    const summary = await harness.service.pollNow();

    expect(summary.processed).toBe(0);
    expect(harness.reviewService.syncSessionReviewState).not.toHaveBeenCalled();
  });

  it('clears implementation_queued state after the poller successfully sends a follow-up', async () => {
    const task = createTask({
      status: 'needs_review',
      internal_state: null,
      disposition: null,
      error: null,
    });
    const harness = buildHarness({
      snapshot: createSnapshot({
        state: 'OPEN',
        reviewDecision: 'CHANGES_REQUESTED',
        threads: [createThread()],
      }),
      tasks: [task],
    });
    harness.reviewAssessmentService.assessThreads.mockImplementation(() => {
      task.status = 'assessed';
      task.disposition = 'implement';
      task.internal_state = null;
      return Promise.resolve({ ok: true, data: [] });
    });
    harness.reviewService.queueReviewTasks = vi.fn((_sessionId: string, taskIds: string[]) => {
      for (const taskId of taskIds) {
        const queuedTask = harness.tasks.find((candidate) => candidate.id === taskId);
        if (queuedTask) {
          queuedTask.status = 'in_progress';
          queuedTask.internal_state = 'implementation_queued';
        }
      }
      return { ok: true, data: undefined };
    });

    const result = await harness.service.pollSession('session-1');

    expect(result.action).toBe('fix_started');
    expect(harness.devSessionService.sendAgentFollowUp).toHaveBeenCalledWith('session-1', expect.any(String));
    expect(harness.reviewTasks.updateStatus).toHaveBeenCalledWith('task-1', 'in_progress', expect.objectContaining({
      internal_state: null,
      error: null,
    }));
    expect(task.internal_state).toBeNull();
  });

  it('uses linked PR status as a fallback when the review snapshot was unchanged', async () => {
    const harness = buildHarness({
      session: createSession({ pr_state: 'MERGED', base_branch: 'master' }),
      snapshot: null,
      tasks: [],
    });
    harness.gitHubService.getPrStatus.mockResolvedValue({
      ok: true,
      data: {
        number: 42,
        url: 'https://github.com/acme/repo/pull/42',
        state: 'MERGED',
        reviewDecision: 'APPROVED',
        baseRefName: 'master',
        checksStatus: 'SUCCESS',
        additions: 1,
        deletions: 0,
        mergeable: 'MERGEABLE',
      },
    });

    const result = await harness.service.pollSession('session-1');

    expect(result.action).toBe('completed');
    expect(harness.gitHubService.getPrStatus).toHaveBeenCalledWith('session-1');
    expect(harness.planService.updateItem).toHaveBeenCalledWith('plan-1', { status_category: 'done' });
    expect(harness.broadcastToWindows).toHaveBeenCalledWith('review-poll:completed', expect.objectContaining({
      baseRefName: 'master',
    }));
  });
});
