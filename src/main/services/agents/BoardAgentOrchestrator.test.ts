import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoardAgentOrchestrator, formatFindings } from './BoardAgentOrchestrator';
import { createAutomationPhaseMachine, type AutomationPhaseRepository } from './automationPhaseMachine';
import { launchPlaybookSubagent } from './autoReview';
import type * as AutoReviewModule from './autoReview';
import type { DevSession } from '../../../shared/types';
import { BUILT_IN_PLAYBOOKS } from '../../../shared/playbooks';
import { toReviewSessionId } from '../../../shared/agent-types';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock('./autoReview', async (importOriginal) => {
  const actual = await importOriginal<typeof AutoReviewModule>();
  return {
    ...actual,
    launchAutoReview: vi.fn(),
    launchPlaybookSubagent: vi.fn(),
  };
});

/**
 * Real phase machine backed by the test's own session object, so assertions
 * check the resulting phase (what callers actually observe) rather than the
 * exact event shape.
 */
function createTestPhaseMachine(session: DevSession) {
  const devSessions: AutomationPhaseRepository = {
    get: () => session,
    updateAutomationPhase: (_id, phase) => {
      session.automation_phase = phase;
    },
    updateAutomationState: (_id, state) => {
      session.automation_phase = state.phase;
      if (state.currentStepId !== undefined) session.current_step_id = state.currentStepId;
      if (state.stepPassCounts !== undefined) session.step_pass_counts = state.stepPassCounts;
      if (state.pausedReason !== undefined) session.paused_reason = state.pausedReason;
      if (state.attentionReason !== undefined) session.attention_reason = state.attentionReason;
    },
  };
  return createAutomationPhaseMachine({ devSessions });
}

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
    review_policy: 'auto',
    automation_phase: 'idle',
    playbook_id: BUILT_IN_PLAYBOOKS.implementOpposingReview.id,
    playbook_snapshot: JSON.stringify(BUILT_IN_PLAYBOOKS.implementOpposingReview),
    current_step_id: 'implement',
    step_pass_counts: null,
    paused_reason: null,
    step_outputs: null,
    initial_instructions: 'Implement task',
    work_brief_revision: 1,
    pr_number: null,
    pr_url: null,
    pr_state: null,
    review_state: null,
    pr_is_draft: false,
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
    const updateItem = vi.fn().mockReturnValue({ ok: true, data: undefined });
    const requestPlanRefresh = vi.fn();
    vi.mocked(launchPlaybookSubagent).mockResolvedValue('session-1-review');

    const callbacks = createBoardAgentOrchestrator({
      agentReviews: {
        persistStartedReview: vi.fn(),
        persistCompletedReview: vi.fn(),
        persistFailedReview: vi.fn(),
        getByReviewSessionIds: vi.fn(() => []),
      },
      planService: { updateItem },
      phaseMachine: createTestPhaseMachine(session),
      getDevSessionService: () => ({
        get: vi.fn(() => session),
        sendAgentFollowUp: vi.fn(),
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

    expect(launchPlaybookSubagent).toHaveBeenCalledWith(expect.objectContaining({
      baseBranch: 'main',
    }));
    expect(launchPlaybookSubagent).not.toHaveBeenCalledWith(expect.objectContaining({
      baseBranch: 'base-sha',
    }));
    expect(session.automation_phase).toBe('reviewing');
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
    const updateItem = vi.fn().mockReturnValue({ ok: true, data: undefined });
    const flushQueuedReviewTasks = vi.fn();
    const requestPlanRefresh = vi.fn();

    const callbacks = createBoardAgentOrchestrator({
      agentReviews: {
        persistStartedReview: vi.fn(),
        persistCompletedReview: vi.fn(),
        persistFailedReview: vi.fn(),
        getByReviewSessionIds: vi.fn(() => []),
      },
      planService: { updateItem },
      phaseMachine: createTestPhaseMachine(session),
      getDevSessionService: () => ({
        get: vi.fn(() => session),
        sendAgentFollowUp: vi.fn(),
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
    expect(session.automation_phase).not.toBe('needs_attention');
    expect(flushQueuedReviewTasks).not.toHaveBeenCalled();
    expect(launchPlaybookSubagent).not.toHaveBeenCalled();
    expect(updateItem).not.toHaveBeenCalled();
    expect(requestPlanRefresh).not.toHaveBeenCalled();
  });

  it('moves straight to review on a playbook with no review step', async () => {
    const session = createSession({
      playbook_id: BUILT_IN_PLAYBOOKS.implementOnly.id,
      playbook_snapshot: JSON.stringify(BUILT_IN_PLAYBOOKS.implementOnly),
    });
    const commitSessionChanges = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const updateItem = vi.fn().mockReturnValue({ ok: true, data: undefined });
    const requestPlanRefresh = vi.fn();

    const callbacks = createBoardAgentOrchestrator({
      agentReviews: {
        persistStartedReview: vi.fn(),
        persistCompletedReview: vi.fn(),
        persistFailedReview: vi.fn(),
        getByReviewSessionIds: vi.fn(() => []),
      },
      planService: { updateItem },
      phaseMachine: createTestPhaseMachine(session),
      getDevSessionService: () => ({
        get: vi.fn(() => session),
        sendAgentFollowUp: vi.fn(),
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
    expect(launchPlaybookSubagent).not.toHaveBeenCalled();
    expect(updateItem).toHaveBeenCalledWith('plan-1', { status_category: 'in_review' });
    expect(session.automation_phase).toBe('ready_for_review');
    expect(requestPlanRefresh).toHaveBeenCalledWith(session.project_id);
  });

  it('reconciles a changed Work Brief before advancing implementation', async () => {
    const session = createSession({ review_policy: 'skip' });
    const commitSessionChanges = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const reconcileWorkBrief = vi.fn().mockResolvedValue({
      ok: true,
      data: { reconciled: true },
    });
    const updateItem = vi.fn().mockReturnValue({ ok: true, data: undefined });
    const flushQueuedReviewTasks = vi.fn();

    const callbacks = createBoardAgentOrchestrator({
      agentReviews: {
        persistStartedReview: vi.fn(),
        persistCompletedReview: vi.fn(),
        persistFailedReview: vi.fn(),
        getByReviewSessionIds: vi.fn(() => []),
      },
      planService: { updateItem },
      phaseMachine: createTestPhaseMachine(session),
      getDevSessionService: () => ({
        get: vi.fn(() => session),
        sendAgentFollowUp: vi.fn(),
        updateStatus: vi.fn(),
        commitSessionChanges,
        requestCommitHookRepair: vi.fn(),
        reconcileWorkBrief,
      }),
      getReviewService: () => ({ flushQueuedReviewTasks }),
      getAgentSessionManager: () => ({
        getByDevSession: vi.fn(),
      } as never),
      getPromptContent: vi.fn(),
      claudeUsageService: { recordUsage: vi.fn() },
      requestPlanRefresh: vi.fn(),
    });

    await callbacks.onSessionComplete?.({
      devSessionId: session.id,
      role: 'implement',
      summary: { filesChanged: 1, additions: 2, deletions: 0 },
    });

    expect(commitSessionChanges).toHaveBeenCalledWith(session.id, session.name);
    expect(reconcileWorkBrief).toHaveBeenCalledWith(session.id);
    expect(flushQueuedReviewTasks).not.toHaveBeenCalled();
    expect(updateItem).not.toHaveBeenCalled();
    expect(launchPlaybookSubagent).not.toHaveBeenCalled();
  });

  it('flushes queued PR review tasks before moving the session forward', async () => {
    const session = createSession({
      playbook_id: BUILT_IN_PLAYBOOKS.implementOnly.id,
      playbook_snapshot: JSON.stringify(BUILT_IN_PLAYBOOKS.implementOnly),
      pr_number: 42,
    });
    const commitSessionChanges = vi.fn().mockResolvedValue({ ok: true, data: undefined });
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
        getByReviewSessionIds: vi.fn(() => []),
      },
      planService: { updateItem },
      phaseMachine: createTestPhaseMachine(session),
      getDevSessionService: () => ({
        get: vi.fn(() => session),
        sendAgentFollowUp: vi.fn(),
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
    expect(session.automation_phase).not.toBe('ready_for_review');
  });

  it('resumes opposing review after the implementation commit-hook repair completes', async () => {
    const session = createSession({ automation_phase: 'fixing_commit_hooks' });
    const commitSessionChanges = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const updateItem = vi.fn().mockReturnValue({ ok: true, data: undefined });
    const requestPlanRefresh = vi.fn();
    vi.mocked(launchPlaybookSubagent).mockResolvedValue('session-1-review');

    const callbacks = createBoardAgentOrchestrator({
      agentReviews: {
        persistStartedReview: vi.fn(),
        persistCompletedReview: vi.fn(),
        persistFailedReview: vi.fn(),
        getByReviewSessionIds: vi.fn(() => []),
      },
      planService: { updateItem },
      phaseMachine: createTestPhaseMachine(session),
      getDevSessionService: () => ({
        get: vi.fn(() => session),
        sendAgentFollowUp: vi.fn(),
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
    expect(session.automation_phase).toBe('reviewing');
    expect(launchPlaybookSubagent).toHaveBeenCalledWith(expect.objectContaining({
      implementationSessionId: session.id,
    }));
    expect(updateItem).not.toHaveBeenCalled();
  });

  it('moves to review after the review-addressing commit-hook repair completes', async () => {
    const session = createSession({ automation_phase: 'fixing_commit_hooks', current_step_id: 'address' });
    const commitSessionChanges = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const updateItem = vi.fn().mockReturnValue({ ok: true, data: undefined });
    const requestPlanRefresh = vi.fn();

    const callbacks = createBoardAgentOrchestrator({
      agentReviews: {
        persistStartedReview: vi.fn(),
        persistCompletedReview: vi.fn(),
        persistFailedReview: vi.fn(),
        getByReviewSessionIds: vi.fn(() => []),
      },
      planService: { updateItem },
      phaseMachine: createTestPhaseMachine(session),
      getDevSessionService: () => ({
        get: vi.fn(() => session),
        sendAgentFollowUp: vi.fn(),
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
    expect(launchPlaybookSubagent).not.toHaveBeenCalled();
    expect(updateItem).toHaveBeenCalledWith('plan-1', { status_category: 'in_review' });
    expect(session.automation_phase).toBe('ready_for_review');
    expect(requestPlanRefresh).toHaveBeenCalledWith(session.project_id);
  });

  it('marks needs_attention when commit hooks still fail after the repair turn', async () => {
    const session = createSession({ automation_phase: 'fixing_commit_hooks' });
    const hookError = 'blocklint failed';
    const commitSessionChanges = vi.fn().mockResolvedValue({ ok: false, error: hookError });
    const requestCommitHookRepair = vi.fn();
    const updateItem = vi.fn().mockReturnValue({ ok: true, data: undefined });
    const flushQueuedReviewTasks = vi.fn();
    const requestPlanRefresh = vi.fn();

    const callbacks = createBoardAgentOrchestrator({
      agentReviews: {
        persistStartedReview: vi.fn(),
        persistCompletedReview: vi.fn(),
        persistFailedReview: vi.fn(),
        getByReviewSessionIds: vi.fn(() => []),
      },
      planService: { updateItem },
      phaseMachine: createTestPhaseMachine(session),
      getDevSessionService: () => ({
        get: vi.fn(() => session),
        sendAgentFollowUp: vi.fn(),
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
    expect(session.automation_phase).toBe('needs_attention');
    expect(flushQueuedReviewTasks).not.toHaveBeenCalled();
    expect(launchPlaybookSubagent).not.toHaveBeenCalled();
    expect(updateItem).not.toHaveBeenCalled();
    expect(requestPlanRefresh).not.toHaveBeenCalled();
  });

  it('sends the review findings to the implementation agent as the addressing step', async () => {
    const session = createSession({ automation_phase: 'reviewing', current_step_id: 'review' });
    const sendAgentFollowUp = vi.fn().mockResolvedValue({ ok: true, data: { restarted: false } });
    const getPromptContent = vi.fn((key: string) => key === 'agents.review_assessment'
      ? 'Assess these findings:\n{{findings}}'
      : key);

    const callbacks = createBoardAgentOrchestrator({
      agentReviews: {
        persistStartedReview: vi.fn(),
        persistCompletedReview: vi.fn(),
        persistFailedReview: vi.fn(),
        getByReviewSessionIds: vi.fn(() => []),
      },
      planService: { updateItem: vi.fn() },
      phaseMachine: createTestPhaseMachine(session),
      getDevSessionService: () => ({
        get: vi.fn(() => session),
        sendAgentFollowUp,
        updateStatus: vi.fn(),
        commitSessionChanges: vi.fn(),
        requestCommitHookRepair: vi.fn(),
        savePlaybookOutputs: vi.fn(),
      }),
      getReviewService: () => ({
        flushQueuedReviewTasks: vi.fn().mockResolvedValue({ ok: true, data: { taskIds: [], context: '' } }),
      }),
      getAgentSessionManager: () => ({ getByDevSession: vi.fn() } as never),
      getPromptContent,
      claudeUsageService: { recordUsage: vi.fn() },
      requestPlanRefresh: vi.fn(),
      listBoardProviders: async () => [
        { id: 'claude', name: 'Claude', available: true, models: [{ id: 'sonnet', name: 'Sonnet', isDefault: true }], capabilities: { nativeSkills: true, reviewSandbox: false } },
        { id: 'codex', name: 'Codex', available: true, models: [{ id: 'codex', name: 'Codex', isDefault: true }], capabilities: { nativeSkills: false, reviewSandbox: true } },
      ],
    });

    await callbacks.onSessionComplete?.({
      devSessionId: toReviewSessionId(session.id),
      implementationSessionId: session.id,
      stepId: 'review',
      runIndex: 0,
      role: 'review',
      summary: { filesChanged: 0, additions: 0, deletions: 0 },
      findings: [
        { severity: 'warning', file: 'src/app.ts', line: 1, description: 'Handle null input.', agent: 'codex', source: 'agent' },
      ],
    });

    expect(session.current_step_id).toBe('address');
    expect(getPromptContent).toHaveBeenCalledWith('agents.review_assessment');
    expect(sendAgentFollowUp).toHaveBeenCalledWith(
      session.id,
      expect.stringContaining('Assess these findings:'),
      // The built-in address step names no role prompt of its own, so the
      // restart falls back to the playbook's first main step.
      { restartAs: { systemPromptKey: undefined, phase: 'addressing_review' } },
    );
    expect(sendAgentFollowUp).toHaveBeenCalledWith(
      session.id,
      expect.stringContaining('[warning] src/app.ts:1'),
      expect.anything(),
    );
  });

  it('treats a follow-up at a snapshotted terminal cursor as ad-hoc instead of restarting step one', async () => {
    const playbook = {
      id: 'custom-terminal', name: 'Terminal', builtIn: false,
      steps: [{ id: 'custom-build', session: 'main', agents: [{ provider: 'claude' }], systemPromptKey: 'agents.implementation_system', directive: { kind: 'prompt', text: 'Build' } }],
    } as const;
    const session = createSession({
      playbook_id: playbook.id, playbook_snapshot: JSON.stringify(playbook),
      current_step_id: null, automation_phase: 'ready_for_review',
    });
    const updateItem = vi.fn().mockReturnValue({ ok: true, data: undefined });
    const callbacks = createBoardAgentOrchestrator({
      agentReviews: {
        persistStartedReview: vi.fn(), persistCompletedReview: vi.fn(), persistFailedReview: vi.fn(),
        getByReviewSessionIds: vi.fn(() => []),
      },
      planService: { updateItem }, phaseMachine: createTestPhaseMachine(session),
      getDevSessionService: () => ({
        get: vi.fn(() => session), sendAgentFollowUp: vi.fn(), updateStatus: vi.fn(),
        commitSessionChanges: vi.fn().mockResolvedValue({ ok: true, data: undefined }), requestCommitHookRepair: vi.fn(),
      }),
      getReviewService: () => null,
      getAgentSessionManager: () => ({ isSessionBusy: vi.fn(() => false) } as never),
      getPromptContent: vi.fn(), claudeUsageService: { recordUsage: vi.fn() }, requestPlanRefresh: vi.fn(),
    });

    await callbacks.onSessionComplete?.({
      devSessionId: session.id, role: 'implement', finalText: 'Ad-hoc follow-up done',
      summary: { filesChanged: 1, additions: 1, deletions: 0 },
    });

    expect(updateItem).toHaveBeenCalledWith('plan-1', { status_category: 'in_review' });
    expect(launchPlaybookSubagent).not.toHaveBeenCalled();
    expect(session.current_step_id).toBeNull();
  });

  it('finishes a terminal playbook without flushing PR review tasks when no PR exists', async () => {
    const playbook = {
      id: 'custom-terminal', name: 'Terminal', builtIn: false,
      steps: [{ id: 'build', session: 'main', agents: [{ provider: 'claude' }], systemPromptKey: 'agents.implementation_system', directive: { kind: 'prompt', text: 'Build' } }],
    } as const;
    const session = createSession({
      playbook_id: playbook.id,
      playbook_snapshot: JSON.stringify(playbook),
      current_step_id: null,
      automation_phase: 'idle',
      pr_number: null,
    });
    const updateItem = vi.fn().mockReturnValue({ ok: true, data: undefined });
    const flushQueuedReviewTasks = vi.fn().mockResolvedValue({
      ok: false,
      error: 'No PR associated with this session',
    });
    const requestPlanRefresh = vi.fn();
    const callbacks = createBoardAgentOrchestrator({
      agentReviews: {
        persistStartedReview: vi.fn(), persistCompletedReview: vi.fn(), persistFailedReview: vi.fn(),
        getByReviewSessionIds: vi.fn(() => []),
      },
      planService: { updateItem }, phaseMachine: createTestPhaseMachine(session),
      getDevSessionService: () => ({
        get: vi.fn(() => session), sendAgentFollowUp: vi.fn(), updateStatus: vi.fn(),
        commitSessionChanges: vi.fn().mockResolvedValue({ ok: true, data: undefined }), requestCommitHookRepair: vi.fn(),
      }),
      getReviewService: () => ({ flushQueuedReviewTasks }),
      getAgentSessionManager: () => ({ isSessionBusy: vi.fn(() => false) } as never),
      getPromptContent: vi.fn(), claudeUsageService: { recordUsage: vi.fn() }, requestPlanRefresh,
    });

    await callbacks.onSessionComplete?.({
      devSessionId: session.id,
      role: 'implement',
      summary: { filesChanged: 1, additions: 1, deletions: 0 },
    });

    expect(flushQueuedReviewTasks).not.toHaveBeenCalled();
    expect(updateItem).toHaveBeenCalledWith('plan-1', { status_category: 'in_review' });
    expect(session.automation_phase).toBe('ready_for_review');
    expect(requestPlanRefresh).toHaveBeenCalledWith(session.project_id);
  });

  it('persists and delivers a harness notice when a writing subagent is followed by a main step', async () => {
    const playbook = {
      id: 'custom-writer', name: 'Writer', builtIn: false,
      steps: [
        { id: 'build', session: 'main', agents: [{ provider: 'claude' }], systemPromptKey: 'agents.implementation_system', directive: { kind: 'prompt', text: 'Build' } },
        { id: 'writer', session: 'subagent', agents: [{ provider: 'codex' }], systemPromptKey: 'agents.review_system', writes: true, directive: { kind: 'prompt', text: 'Edit files' } },
        { id: 'verify', session: 'main', directive: { kind: 'prompt', text: 'Verify the result' } },
      ],
    } as const;
    const session = createSession({
      playbook_id: playbook.id,
      playbook_snapshot: JSON.stringify(playbook),
      current_step_id: 'build',
    });
    const sendAgentFollowUp = vi.fn().mockResolvedValue({ ok: true, data: { restarted: false } });
    const persistedOutputs: string[] = [];
    vi.mocked(launchPlaybookSubagent).mockResolvedValue('writer-runtime');
    const callbacks = createBoardAgentOrchestrator({
      agentReviews: {
        persistStartedReview: vi.fn(), persistCompletedReview: vi.fn(), persistFailedReview: vi.fn(),
        getByReviewSessionIds: vi.fn(() => []),
      },
      planService: { updateItem: vi.fn() },
      phaseMachine: createTestPhaseMachine(session),
      getDevSessionService: () => ({
        get: vi.fn(() => session), sendAgentFollowUp, updateStatus: vi.fn(),
        commitSessionChanges: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        requestCommitHookRepair: vi.fn(),
        savePlaybookOutputs: vi.fn((_id, value) => persistedOutputs.push(JSON.stringify(value))),
      }),
      getReviewService: () => null,
      getAgentSessionManager: () => ({ isSessionBusy: vi.fn(() => false) } as never),
      getPromptContent: vi.fn((key: string) => key),
      claudeUsageService: { recordUsage: vi.fn() }, requestPlanRefresh: vi.fn(),
      listBoardProviders: async () => [
        { id: 'claude', name: 'Claude', available: true, models: [{ id: 'sonnet', name: 'Sonnet', isDefault: true }], capabilities: { nativeSkills: true, reviewSandbox: false } },
        { id: 'codex', name: 'Codex', available: true, models: [{ id: 'codex', name: 'Codex', isDefault: true }], capabilities: { nativeSkills: false, reviewSandbox: true } },
      ],
    });

    await callbacks.onSessionComplete?.({ devSessionId: session.id, role: 'implement', summary: { filesChanged: 1, additions: 1, deletions: 0 } });
    await callbacks.onSessionComplete?.({
      devSessionId: 'writer-runtime', implementationSessionId: session.id, stepId: 'writer', runIndex: 0,
      role: 'review', summary: { filesChanged: 1, additions: 1, deletions: 0 }, finalText: 'Writer output',
    });

    expect(persistedOutputs.some((value) => value.includes('__harness_worktree_modified'))).toBe(true);
    expect(launchPlaybookSubagent).toHaveBeenCalledWith(expect.objectContaining({
      directive: expect.stringContaining('Do not create commits'),
      writes: true,
    }));
    expect(sendAgentFollowUp).toHaveBeenCalledWith(
      session.id,
      expect.stringContaining('Another agent modified the worktree'),
      expect.anything(),
    );
    expect(persistedOutputs.at(-1)).not.toContain('__harness_worktree_modified');
  });

  it('reconstructs and settles a completed fan-out after an orchestrator restart', async () => {
    const playbook = {
      id: 'custom-fanout', name: 'Fanout', builtIn: false,
      steps: [
        { id: 'build', session: 'main', agents: [{ provider: 'claude' }], systemPromptKey: 'agents.implementation_system', directive: { kind: 'prompt', text: 'Build' } },
        { id: 'critics', session: 'subagent', runs: [[{ provider: 'codex' }], [{ provider: 'claude' }]], systemPromptKey: 'agents.review_system', directive: { kind: 'prompt', text: 'Review' } },
        { id: 'synthesize', session: 'main', directive: { kind: 'prompt', text: 'Synthesize:\n{{output:critics}}' } },
      ],
    } as const;
    const session = createSession({
      playbook_id: playbook.id,
      playbook_snapshot: JSON.stringify(playbook),
      current_step_id: 'critics',
      automation_phase: 'reviewing',
      step_pass_counts: '{"critics":0}',
    });
    const sendAgentFollowUp = vi.fn().mockResolvedValue({ ok: true, data: { restarted: false } });
    const getByReviewSessionIds = vi.fn(() => [
      { review_session_id: `${session.id}-playbook-critics-0-0`, run_index: 0, status: 'complete', raw_output: 'first persisted output', findings: [] },
      { review_session_id: `${session.id}-playbook-critics-0-1`, run_index: 1, status: 'complete', raw_output: 'second persisted output', findings: [] },
    ] as never);
    const callbacks = createBoardAgentOrchestrator({
      agentReviews: {
        persistStartedReview: vi.fn(), persistCompletedReview: vi.fn(), persistFailedReview: vi.fn(), getByReviewSessionIds,
      },
      planService: { updateItem: vi.fn() }, phaseMachine: createTestPhaseMachine(session),
      getDevSessionService: () => ({
        get: vi.fn(() => session), sendAgentFollowUp, updateStatus: vi.fn(),
        commitSessionChanges: vi.fn(), requestCommitHookRepair: vi.fn(), savePlaybookOutputs: vi.fn(),
      }),
      getReviewService: () => null,
      getAgentSessionManager: () => ({ isSessionBusy: vi.fn(() => false) } as never),
      getPromptContent: vi.fn((key: string) => key), claudeUsageService: { recordUsage: vi.fn() },
      requestPlanRefresh: vi.fn(),
      listBoardProviders: async () => [
        { id: 'claude', name: 'Claude', available: true, models: [{ id: 'sonnet', name: 'Sonnet', isDefault: true }], capabilities: { nativeSkills: true, reviewSandbox: false } },
        { id: 'codex', name: 'Codex', available: true, models: [{ id: 'codex', name: 'Codex', isDefault: true }], capabilities: { nativeSkills: false, reviewSandbox: true } },
      ],
    });

    expect(await callbacks.resumePlaybook(session.id)).toBe(true);

    expect(getByReviewSessionIds).toHaveBeenCalledWith([
      `${session.id}-playbook-critics-0-0`, `${session.id}-playbook-critics-0-1`,
    ]);
    expect(launchPlaybookSubagent).not.toHaveBeenCalled();
    expect(sendAgentFollowUp).toHaveBeenCalledWith(
      session.id,
      expect.stringContaining('first persisted output'),
      expect.anything(),
    );
    expect(sendAgentFollowUp).toHaveBeenCalledWith(
      session.id,
      expect.stringContaining('second persisted output'),
      expect.anything(),
    );
    expect(session.step_pass_counts).toBe('{"critics":0}');
  });

  it('finishes an ad-hoc review on the fresh-install implement-only playbook instead of failing on an unknown cursor', async () => {
    const playbook = BUILT_IN_PLAYBOOKS.implementOnly;
    const session = createSession({
      playbook_id: playbook.id,
      playbook_snapshot: JSON.stringify(playbook),
      current_step_id: 'ad-hoc-review',
      automation_phase: 'reviewing',
    });
    const updateItem = vi.fn().mockReturnValue({ ok: true, data: undefined });
    const requestPlanRefresh = vi.fn();
    const phaseMachine = createTestPhaseMachine(session);
    const transitionSpy = vi.spyOn(phaseMachine, 'transition');

    const callbacks = createBoardAgentOrchestrator({
      agentReviews: {
        persistStartedReview: vi.fn(), persistCompletedReview: vi.fn(), persistFailedReview: vi.fn(),
        getByReviewSessionIds: vi.fn(() => []),
      },
      planService: { updateItem },
      phaseMachine,
      getDevSessionService: () => ({
        get: vi.fn(() => session), sendAgentFollowUp: vi.fn(), updateStatus: vi.fn(),
        commitSessionChanges: vi.fn(), requestCommitHookRepair: vi.fn(),
      }),
      getReviewService: () => null,
      getAgentSessionManager: () => ({ isSessionBusy: vi.fn(() => false) } as never),
      getPromptContent: vi.fn(), claudeUsageService: { recordUsage: vi.fn() }, requestPlanRefresh,
    });

    await callbacks.onSessionComplete?.({
      devSessionId: toReviewSessionId(session.id),
      implementationSessionId: session.id,
      stepId: 'ad-hoc-review',
      role: 'review',
      findings: [],
      summary: { filesChanged: 0, additions: 0, deletions: 0 },
    });

    expect(transitionSpy).not.toHaveBeenCalledWith(session.id, expect.objectContaining({ type: 'automationFailed' }));
    expect(updateItem).toHaveBeenCalledWith('plan-1', { status_category: 'in_review' });
    expect(session.automation_phase).toBe('ready_for_review');
    expect(requestPlanRefresh).toHaveBeenCalledWith(session.project_id);
  });

  it('finishes at terminal instead of restarting the playbook when the persisted cursor is a PR review follow-up', async () => {
    const playbook = BUILT_IN_PLAYBOOKS.implementOpposingReview;
    const session = createSession({
      playbook_id: playbook.id,
      playbook_snapshot: JSON.stringify(playbook),
      current_step_id: 'pr-review-followup',
      automation_phase: 'addressing_review',
    });
    const commitSessionChanges = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const sendAgentFollowUp = vi.fn();
    const updateItem = vi.fn().mockReturnValue({ ok: true, data: undefined });
    const requestPlanRefresh = vi.fn();

    const callbacks = createBoardAgentOrchestrator({
      agentReviews: {
        persistStartedReview: vi.fn(), persistCompletedReview: vi.fn(), persistFailedReview: vi.fn(),
        getByReviewSessionIds: vi.fn(() => []),
      },
      planService: { updateItem },
      phaseMachine: createTestPhaseMachine(session),
      getDevSessionService: () => ({
        get: vi.fn(() => session), sendAgentFollowUp, updateStatus: vi.fn(),
        commitSessionChanges, requestCommitHookRepair: vi.fn(),
      }),
      getReviewService: () => null,
      getAgentSessionManager: () => ({ isSessionBusy: vi.fn(() => false) } as never),
      getPromptContent: vi.fn(), claudeUsageService: { recordUsage: vi.fn() }, requestPlanRefresh,
    });

    await callbacks.onSessionComplete?.({
      devSessionId: session.id,
      role: 'implement',
      summary: { filesChanged: 1, additions: 1, deletions: 0 },
    });

    expect(sendAgentFollowUp).not.toHaveBeenCalled();
    expect(launchPlaybookSubagent).not.toHaveBeenCalled();
    expect(launchPlaybookSubagent).not.toHaveBeenCalled();
    expect(updateItem).toHaveBeenCalledWith('plan-1', { status_category: 'in_review' });
    expect(session.automation_phase).toBe('ready_for_review');
  });
});

describe('formatFindings', () => {
  const finding = (description: string, axis?: 'standards' | 'spec' | 'general') => ({
    severity: 'warning' as const,
    description,
    agent: 'codex' as const,
    source: 'agent' as const,
    ...(axis ? { axis } : {}),
  });

  it('leaves untagged findings as a flat numbered list', () => {
    expect(formatFindings([finding('a'), finding('b')]))
      .toBe('1. [warning] —\n   a\n2. [warning] —\n   b');
  });

  it('groups two-axis findings under headings, preserving within-axis order and never reranking', () => {
    expect(formatFindings([
      finding('spec one', 'spec'),
      finding('standards one', 'standards'),
      finding('spec two', 'spec'),
    ])).toBe(
      '## Standards\n1. [warning] —\n   standards one\n\n'
      + '## Spec\n1. [warning] —\n   spec one\n2. [warning] —\n   spec two',
    );
  });
});
