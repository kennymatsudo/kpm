import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoardAgentOrchestrator } from './BoardAgentOrchestrator';
import { launchAutoReview } from './autoReview';
import type { DevSession } from '../../../shared/types';

vi.mock('./autoReview', () => ({
  launchAutoReview: vi.fn(),
}));

function createSession(overrides: Partial<DevSession> = {}): DevSession {
  return {
    id: 'session-1',
    project_id: 'project-1',
    plan_item_id: 'plan-1',
    repo_id: 'repo-1',
    name: 'Implement task',
    worktree_path: '/tmp/worktree',
    branch_name: 'feature/task',
    base_branch: 'main',
    base_sha: 'base-sha',
    status: 'inactive',
    agent_type: 'claude',
    execution_mode: 'workflow',
    review_policy: 'auto',
    automation_phase: 'idle',
    initial_instructions: 'Implement task',
    pr_number: null,
    pr_url: null,
    pr_state: null,
    review_state: null,
    merge_order: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    completed_at: null,
    ...overrides,
  };
}

describe('BoardAgentOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('launches opposing review against the session base branch, not the captured base sha', async () => {
    const session = createSession({ base_branch: 'main', base_sha: 'base-sha' });
    const commitSessionChanges = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const updateAutomationPhase = vi.fn();
    const updateItem = vi.fn().mockReturnValue({ ok: true, data: undefined });
    const requestPlanRefresh = vi.fn();
    vi.mocked(launchAutoReview).mockResolvedValue('session-1-review');

    const callbacks = createBoardAgentOrchestrator({
      agentReviews: {
        persistStartedReview: vi.fn(),
        persistCompletedReview: vi.fn(),
        persistFailedReview: vi.fn(),
      },
      planService: { updateItem },
      getDevSessionService: () => ({
        get: vi.fn(() => session),
        sendAgentFollowUp: vi.fn(),
        updateAutomationPhase,
        updateStatus: vi.fn(),
        commitSessionChanges,
        requestCommitHookRepair: vi.fn(),
      }),
      getReviewService: () => ({
        flushQueuedReviewTasks: vi.fn().mockResolvedValue({ ok: true, data: { taskIds: [], context: '' } }),
      }),
      getAgentSessionManager: () => ({
        getByDevSession: vi.fn(),
      } as never),
      getPromptContent: vi.fn(),
      claudeUsageService: { recordUsage: vi.fn() },
      requestPlanRefresh,
    });

    await callbacks.onSessionComplete?.({
      devSessionId: session.id,
      role: 'implement',
      summary: { filesChanged: 1, additions: 2, deletions: 0 },
    });

    expect(launchAutoReview).toHaveBeenCalledWith(expect.objectContaining({
      baseBranch: 'main',
    }));
    expect(launchAutoReview).not.toHaveBeenCalledWith(expect.objectContaining({
      baseBranch: 'base-sha',
    }));
    expect(updateAutomationPhase).toHaveBeenCalledWith(session.id, 'reviewing');
    expect(updateItem).not.toHaveBeenCalled();
  });

  it('starts a commit-hook repair turn and skips review when auto-commit hooks fail', async () => {
    const session = createSession({ review_policy: 'auto' });
    const hookError = [
      'services/example_service/tests/test_example_service.py:3119: error: Returning Any from function declared to return "dict[Any, Any]"  [no-any-return]',
      'Found 1 error in 1 file (checked 4 source files)',
      '',
      'mypy failed.',
    ].join('\n');
    const commitSessionChanges = vi.fn().mockResolvedValue({ ok: false, error: hookError });
    const requestCommitHookRepair = vi.fn().mockResolvedValue({
      ok: true,
      data: { started: true, alreadyAttempted: false },
    });
    const updateAutomationPhase = vi.fn();
    const updateItem = vi.fn().mockReturnValue({ ok: true, data: undefined });
    const flushQueuedReviewTasks = vi.fn();
    const requestPlanRefresh = vi.fn();

    const callbacks = createBoardAgentOrchestrator({
      agentReviews: {
        persistStartedReview: vi.fn(),
        persistCompletedReview: vi.fn(),
        persistFailedReview: vi.fn(),
      },
      planService: { updateItem },
      getDevSessionService: () => ({
        get: vi.fn(() => session),
        sendAgentFollowUp: vi.fn(),
        updateAutomationPhase,
        updateStatus: vi.fn(),
        commitSessionChanges,
        requestCommitHookRepair,
      }),
      getReviewService: () => ({ flushQueuedReviewTasks }),
      getAgentSessionManager: () => ({
        getByDevSession: vi.fn(),
      } as never),
      getPromptContent: vi.fn(),
      claudeUsageService: { recordUsage: vi.fn() },
      requestPlanRefresh,
    });

    await callbacks.onSessionComplete?.({
      devSessionId: session.id,
      role: 'implement',
      summary: { filesChanged: 1, additions: 2, deletions: 0 },
    });

    expect(commitSessionChanges).toHaveBeenCalledWith(session.id, session.name);
    expect(requestCommitHookRepair).toHaveBeenCalledWith(session.id, hookError);
    expect(updateAutomationPhase).not.toHaveBeenCalledWith(session.id, 'needs_attention');
    expect(flushQueuedReviewTasks).not.toHaveBeenCalled();
    expect(launchAutoReview).not.toHaveBeenCalled();
    expect(updateItem).not.toHaveBeenCalled();
    expect(requestPlanRefresh).not.toHaveBeenCalled();
  });

  it('skips opposing review when the session review policy is skip', async () => {
    const session = createSession({ review_policy: 'skip' });
    const commitSessionChanges = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const updateAutomationPhase = vi.fn();
    const updateItem = vi.fn().mockReturnValue({ ok: true, data: undefined });
    const requestPlanRefresh = vi.fn();

    const callbacks = createBoardAgentOrchestrator({
      agentReviews: {
        persistStartedReview: vi.fn(),
        persistCompletedReview: vi.fn(),
        persistFailedReview: vi.fn(),
      },
      planService: { updateItem },
      getDevSessionService: () => ({
        get: vi.fn(() => session),
        sendAgentFollowUp: vi.fn(),
        updateAutomationPhase,
        updateStatus: vi.fn(),
        commitSessionChanges,
        requestCommitHookRepair: vi.fn(),
      }),
      getReviewService: () => ({
        flushQueuedReviewTasks: vi.fn().mockResolvedValue({ ok: true, data: { taskIds: [], context: '' } }),
      }),
      getAgentSessionManager: () => ({
        getByDevSession: vi.fn(),
      } as never),
      getPromptContent: vi.fn(),
      claudeUsageService: { recordUsage: vi.fn() },
      requestPlanRefresh,
    });

    await callbacks.onSessionComplete?.({
      devSessionId: session.id,
      role: 'implement',
      summary: { filesChanged: 1, additions: 2, deletions: 0 },
    });

    expect(commitSessionChanges).toHaveBeenCalledWith(session.id, session.name);
    expect(launchAutoReview).not.toHaveBeenCalled();
    expect(updateItem).toHaveBeenCalledWith('plan-1', { status_category: 'in_review' });
    expect(updateAutomationPhase).toHaveBeenCalledWith(session.id, 'ready_for_review');
    expect(requestPlanRefresh).toHaveBeenCalledWith(session.project_id);
  });

  it('flushes queued PR review tasks before moving the session forward', async () => {
    const session = createSession({ automation_phase: 'addressing_review' });
    const commitSessionChanges = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const updateAutomationPhase = vi.fn();
    const updateItem = vi.fn().mockReturnValue({ ok: true, data: undefined });
    const requestPlanRefresh = vi.fn();
    const flushQueuedReviewTasks = vi.fn().mockResolvedValue({
      ok: true,
      data: { taskIds: ['review-task-1', 'review-task-2'], context: 'THREADS' },
    });

    const callbacks = createBoardAgentOrchestrator({
      agentReviews: {
        persistStartedReview: vi.fn(),
        persistCompletedReview: vi.fn(),
        persistFailedReview: vi.fn(),
      },
      planService: { updateItem },
      getDevSessionService: () => ({
        get: vi.fn(() => session),
        sendAgentFollowUp: vi.fn(),
        updateAutomationPhase,
        updateStatus: vi.fn(),
        commitSessionChanges,
        requestCommitHookRepair: vi.fn(),
      }),
      getReviewService: () => ({ flushQueuedReviewTasks }),
      getAgentSessionManager: () => ({
        getByDevSession: vi.fn(),
      } as never),
      getPromptContent: vi.fn(),
      claudeUsageService: { recordUsage: vi.fn() },
      requestPlanRefresh,
    });

    await callbacks.onSessionComplete?.({
      devSessionId: session.id,
      role: 'implement',
      summary: { filesChanged: 1, additions: 2, deletions: 0 },
    });

    expect(flushQueuedReviewTasks).toHaveBeenCalledWith(session.id);
    expect(updateItem).not.toHaveBeenCalled();
    expect(updateAutomationPhase).not.toHaveBeenCalledWith(session.id, 'ready_for_review');
  });

  it('resumes opposing review after the implementation commit-hook repair completes', async () => {
    const session = createSession({ automation_phase: 'fixing_commit_hooks' });
    const commitSessionChanges = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const updateAutomationPhase = vi.fn();
    const updateItem = vi.fn().mockReturnValue({ ok: true, data: undefined });
    const requestPlanRefresh = vi.fn();
    vi.mocked(launchAutoReview).mockResolvedValue('session-1-review');

    const callbacks = createBoardAgentOrchestrator({
      agentReviews: {
        persistStartedReview: vi.fn(),
        persistCompletedReview: vi.fn(),
        persistFailedReview: vi.fn(),
      },
      planService: { updateItem },
      getDevSessionService: () => ({
        get: vi.fn(() => session),
        sendAgentFollowUp: vi.fn(),
        updateAutomationPhase,
        updateStatus: vi.fn(),
        commitSessionChanges,
        requestCommitHookRepair: vi.fn(),
      }),
      getReviewService: () => ({
        flushQueuedReviewTasks: vi.fn().mockResolvedValue({ ok: true, data: { taskIds: [], context: '' } }),
      }),
      getAgentSessionManager: () => ({
        getByDevSession: vi.fn(),
      } as never),
      getPromptContent: vi.fn(),
      claudeUsageService: { recordUsage: vi.fn() },
      requestPlanRefresh,
    });

    await callbacks.onSessionComplete?.({
      devSessionId: session.id,
      role: 'implement',
      summary: { filesChanged: 1, additions: 2, deletions: 0 },
    });

    expect(commitSessionChanges).toHaveBeenCalledWith(session.id, session.name);
    expect(updateAutomationPhase).toHaveBeenCalledWith(session.id, 'reviewing');
    expect(launchAutoReview).toHaveBeenCalledWith(expect.objectContaining({
      implementationSessionId: session.id,
    }));
    expect(updateItem).not.toHaveBeenCalled();
  });

  it('moves to review after the review-addressing commit-hook repair completes', async () => {
    const session = createSession({ automation_phase: 'fixing_commit_hooks_after_review' });
    const commitSessionChanges = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const updateAutomationPhase = vi.fn();
    const updateItem = vi.fn().mockReturnValue({ ok: true, data: undefined });
    const requestPlanRefresh = vi.fn();

    const callbacks = createBoardAgentOrchestrator({
      agentReviews: {
        persistStartedReview: vi.fn(),
        persistCompletedReview: vi.fn(),
        persistFailedReview: vi.fn(),
      },
      planService: { updateItem },
      getDevSessionService: () => ({
        get: vi.fn(() => session),
        sendAgentFollowUp: vi.fn(),
        updateAutomationPhase,
        updateStatus: vi.fn(),
        commitSessionChanges,
        requestCommitHookRepair: vi.fn(),
      }),
      getReviewService: () => ({
        flushQueuedReviewTasks: vi.fn().mockResolvedValue({ ok: true, data: { taskIds: [], context: '' } }),
      }),
      getAgentSessionManager: () => ({
        getByDevSession: vi.fn(),
      } as never),
      getPromptContent: vi.fn(),
      claudeUsageService: { recordUsage: vi.fn() },
      requestPlanRefresh,
    });

    await callbacks.onSessionComplete?.({
      devSessionId: session.id,
      role: 'implement',
      summary: { filesChanged: 1, additions: 2, deletions: 0 },
    });

    expect(commitSessionChanges).toHaveBeenCalledWith(session.id, 'Address review findings');
    expect(launchAutoReview).not.toHaveBeenCalled();
    expect(updateItem).toHaveBeenCalledWith('plan-1', { status_category: 'in_review' });
    expect(updateAutomationPhase).toHaveBeenCalledWith(session.id, 'ready_for_review');
    expect(requestPlanRefresh).toHaveBeenCalledWith(session.project_id);
  });

  it('marks needs_attention when commit hooks still fail after the repair turn', async () => {
    const session = createSession({ automation_phase: 'fixing_commit_hooks' });
    const hookError = 'blocklint failed';
    const commitSessionChanges = vi.fn().mockResolvedValue({ ok: false, error: hookError });
    const requestCommitHookRepair = vi.fn();
    const updateAutomationPhase = vi.fn();
    const updateItem = vi.fn().mockReturnValue({ ok: true, data: undefined });
    const flushQueuedReviewTasks = vi.fn();
    const requestPlanRefresh = vi.fn();

    const callbacks = createBoardAgentOrchestrator({
      agentReviews: {
        persistStartedReview: vi.fn(),
        persistCompletedReview: vi.fn(),
        persistFailedReview: vi.fn(),
      },
      planService: { updateItem },
      getDevSessionService: () => ({
        get: vi.fn(() => session),
        sendAgentFollowUp: vi.fn(),
        updateAutomationPhase,
        updateStatus: vi.fn(),
        commitSessionChanges,
        requestCommitHookRepair,
      }),
      getReviewService: () => ({ flushQueuedReviewTasks }),
      getAgentSessionManager: () => ({
        getByDevSession: vi.fn(),
      } as never),
      getPromptContent: vi.fn(),
      claudeUsageService: { recordUsage: vi.fn() },
      requestPlanRefresh,
    });

    await callbacks.onSessionComplete?.({
      devSessionId: session.id,
      role: 'implement',
      summary: { filesChanged: 1, additions: 2, deletions: 0 },
    });

    expect(requestCommitHookRepair).not.toHaveBeenCalled();
    expect(updateAutomationPhase).toHaveBeenCalledWith(session.id, 'needs_attention');
    expect(flushQueuedReviewTasks).not.toHaveBeenCalled();
    expect(launchAutoReview).not.toHaveBeenCalled();
    expect(updateItem).not.toHaveBeenCalled();
    expect(requestPlanRefresh).not.toHaveBeenCalled();
  });
});
