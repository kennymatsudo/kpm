import { describe, expect, it, vi } from 'vitest';
import type { DevSession } from '../../../shared/types';
import { AD_HOC_REVIEW_STEP, BUILT_IN_PLAYBOOKS } from '../../../shared/playbooks';
import { failure, success } from '../result';
import { createAutomationPhaseMachine, type AutomationPhaseRepository } from './automationPhaseMachine';
import { requestHarnessReview, requestHarnessTurn } from './harnessTurn';

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));

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

function createDeps(session: DevSession) {
  const devSessions: AutomationPhaseRepository = {
    get: () => session,
    updateAutomationPhase: (_id, phase) => { session.automation_phase = phase; },
    updateAutomationState: (_id, state) => {
      session.automation_phase = state.phase;
      if (state.currentStepId !== undefined) session.current_step_id = state.currentStepId;
      if (state.pausedReason !== undefined) session.paused_reason = state.pausedReason;
      if (state.attentionReason !== undefined) session.attention_reason = state.attentionReason;
    },
  };
  return {
    devSessions: { get: () => session },
    phaseMachine: createAutomationPhaseMachine({ devSessions }),
  };
}

describe('requestHarnessTurn', () => {
  it('leaves the cursor on the interrupted step when the agent is mid-turn', async () => {
    const session = createSession();
    const deps = {
      ...createDeps(session),
      sendAgentFollowUp: vi.fn().mockResolvedValue({ ok: true, data: { restarted: false, deferred: true } }),
    };

    const result = await requestHarnessTurn(deps, {
      sessionId: session.id,
      kind: 'pr-review-followup',
      buildPrompt: () => Promise.resolve(success('address these threads')),
    });

    expect(result).toEqual({ ok: true, data: 'deferred' });
    expect(session.current_step_id).toBe('implement');
    expect(session.automation_phase).toBe('idle');
  });

  it('moves the cursor onto the injected step once the agent takes the turn', async () => {
    const session = createSession();
    const deps = {
      ...createDeps(session),
      sendAgentFollowUp: vi.fn().mockResolvedValue({ ok: true, data: { restarted: false } }),
    };

    const result = await requestHarnessTurn(deps, {
      sessionId: session.id,
      kind: 'pr-review-followup',
      buildPrompt: () => Promise.resolve(success('address these threads')),
    });

    expect(result).toEqual({ ok: true, data: 'sent' });
    expect(session.current_step_id).toBe('pr-review-followup');
    expect(session.automation_phase).toBe('addressing_review');
  });

  it('needs attention when the turn cannot be built', async () => {
    const session = createSession();
    const deps = {
      ...createDeps(session),
      sendAgentFollowUp: vi.fn(),
    };

    const result = await requestHarnessTurn(deps, {
      sessionId: session.id,
      kind: 'commit-hook-repair',
      buildPrompt: () => Promise.resolve(failure('no hook output')),
    });

    expect(result).toEqual({ ok: false, error: 'no hook output' });
    expect(deps.sendAgentFollowUp).not.toHaveBeenCalled();
    expect(session.automation_phase).toBe('needs_attention');
    expect(session.attention_reason).toBe('follow-up-send-failed');
  });
});

describe('requestHarnessReview', () => {
  it('restores the interrupted cursor when no reviewer can run', async () => {
    const session = createSession({ automation_phase: 'paused', paused_reason: 'gate' });
    const deps = createDeps(session);

    const result = await requestHarnessReview(deps, {
      sessionId: session.id,
      step: AD_HOC_REVIEW_STEP,
      launch: () => Promise.resolve(null),
    });

    expect(result).toEqual({ ok: true, data: null });
    expect(session.current_step_id).toBe('implement');
    expect(session.automation_phase).toBe('paused');
    expect(session.paused_reason).toBe('gate');
  });

  it('holds the review cursor while the review runs', async () => {
    const session = createSession();
    const deps = createDeps(session);

    const result = await requestHarnessReview(deps, {
      sessionId: session.id,
      step: AD_HOC_REVIEW_STEP,
      launch: async () => {
        expect(session.current_step_id).toBe(AD_HOC_REVIEW_STEP.id);
        return 'session-1-review';
      },
    });

    expect(result).toEqual({ ok: true, data: 'session-1-review' });
    expect(session.automation_phase).toBe('reviewing');
  });
});
