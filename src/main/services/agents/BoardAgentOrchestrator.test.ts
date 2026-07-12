import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoardAgentOrchestrator, formatFindings } from './BoardAgentOrchestrator';
import { createAutomationPhaseMachine, type AutomationPhaseRepository } from './automationPhaseMachine';
import { launchAutoReview, launchPlaybookSubagent } from './autoReview';
import type * as AutoReviewModule from './autoReview';
import type { DevSession } from '../../../shared/types';

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
    playbook_id: null,
    playbook_snapshot: null,
    current_step_id: null,
    step_pass_counts: null,
    paused_reason: null,
    step_outputs: null,
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
    const updateItem = vi.fn().mockReturnValue({ ok: true, data: undefined });
    const requestPlanRefresh = vi.fn();
    vi.mocked(launchAutoReview).mockResolvedValue('session-1-review');

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

    expect(launchAutoReview).toHaveBeenCalledWith(expect.objectContaining({
      baseBranch: 'main',
    }));
    expect(launchAutoReview).not.toHaveBeenCalledWith(expect.objectContaining({
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
    expect(launchAutoReview).not.toHaveBeenCalled();
    expect(updateItem).not.toHaveBeenCalled();
    expect(requestPlanRefresh).not.toHaveBeenCalled();
  });

  it('skips opposing review when the session review policy is skip', async () => {
    const session = createSession({ review_policy: 'skip' });
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
    expect(launchAutoReview).not.toHaveBeenCalled();
    expect(updateItem).toHaveBeenCalledWith('plan-1', { status_category: 'in_review' });
    expect(session.automation_phase).toBe('ready_for_review');
    expect(requestPlanRefresh).toHaveBeenCalledWith(session.project_id);
  });

  it('flushes queued PR review tasks before moving the session forward', async () => {
    const session = createSession({ automation_phase: 'addressing_review' });
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
    vi.mocked(launchAutoReview).mockResolvedValue('session-1-review');

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
    expect(launchAutoReview).toHaveBeenCalledWith(expect.objectContaining({
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
    expect(launchAutoReview).not.toHaveBeenCalled();
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
    expect(launchAutoReview).not.toHaveBeenCalled();
    expect(updateItem).not.toHaveBeenCalled();
    expect(requestPlanRefresh).not.toHaveBeenCalled();
  });

  it('skips the automated review follow-up when the impl session is already busy', async () => {
    const session = createSession({ automation_phase: 'reviewing' });
    const sendAgentFollowUp = vi.fn();
    const isSessionBusy = vi.fn().mockReturnValue(true);

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
      }),
      getReviewService: () => ({
        flushQueuedReviewTasks: vi.fn().mockResolvedValue({ ok: true, data: { taskIds: [], context: '' } }),
      }),
      getAgentSessionManager: () => ({
        getByDevSession: vi.fn(),
        isSessionBusy,
      } as never),
      getPromptContent: vi.fn(),
      claudeUsageService: { recordUsage: vi.fn() },
      requestPlanRefresh: vi.fn(),
    });

    await callbacks.onSessionComplete?.({
      devSessionId: session.id,
      role: 'review',
      summary: { filesChanged: 0, additions: 0, deletions: 0 },
      findings: [
        { severity: 'warning', file: 'src/app.ts', line: 1, description: 'Handle null input.', agent: 'codex', source: 'agent' },
      ],
    });

    expect(isSessionBusy).toHaveBeenCalledWith(session.id);
    expect(session.automation_phase).toBe('addressing_review');
    expect(sendAgentFollowUp).not.toHaveBeenCalled();
  });

  it('sends the automated review follow-up when the impl session is idle', async () => {
    const session = createSession({ automation_phase: 'reviewing' });
    const sendAgentFollowUp = vi.fn().mockResolvedValue({ ok: true, data: { restarted: false } });
    const isSessionBusy = vi.fn().mockReturnValue(false);
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
      }),
      getReviewService: () => ({
        flushQueuedReviewTasks: vi.fn().mockResolvedValue({ ok: true, data: { taskIds: [], context: '' } }),
      }),
      getAgentSessionManager: () => ({
        getByDevSession: vi.fn(),
        isSessionBusy,
      } as never),
      getPromptContent,
      claudeUsageService: { recordUsage: vi.fn() },
      requestPlanRefresh: vi.fn(),
    });

    await callbacks.onSessionComplete?.({
      devSessionId: session.id,
      role: 'review',
      summary: { filesChanged: 0, additions: 0, deletions: 0 },
      findings: [
        { severity: 'warning', file: 'src/app.ts', line: 1, description: 'Handle null input.', agent: 'codex', source: 'agent' },
      ],
    });

    expect(isSessionBusy).toHaveBeenCalledWith(session.id);
    expect(getPromptContent).toHaveBeenCalledWith('agents.review_assessment');
    expect(sendAgentFollowUp).toHaveBeenCalledWith(session.id, expect.stringContaining('Assess these findings:'));
    expect(sendAgentFollowUp).toHaveBeenCalledWith(session.id, expect.stringContaining('[warning] src/app.ts:1'));
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
    expect(sendAgentFollowUp).toHaveBeenCalledWith(session.id, expect.stringContaining('Another agent modified the worktree'));
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
    expect(sendAgentFollowUp).toHaveBeenCalledWith(session.id, expect.stringContaining('first persisted output'));
    expect(sendAgentFollowUp).toHaveBeenCalledWith(session.id, expect.stringContaining('second persisted output'));
    expect(session.step_pass_counts).toBe('{"critics":0}');
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
