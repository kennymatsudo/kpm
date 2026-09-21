import { describe, expect, it, vi } from 'vitest';
import { BUILT_IN_PLAYBOOKS } from '../../../shared/playbooks';
import type { DevSession } from '../../../shared/types';
import { createPlaybookStepRunner } from './playbookStepRunner';

function createSession(): DevSession {
  return {
    id: 'session-1', project_id: 'project-1', plan_item_id: 'plan-1', repo_id: 'repo-1',
    name: 'Implement task', worktree_path: '/tmp/worktree', branch_name: 'feature/task', base_branch: 'main', base_sha: 'base-sha',
    status: 'inactive', agent_type: 'claude', review_policy: 'auto', automation_phase: 'idle',
    playbook_id: BUILT_IN_PLAYBOOKS.implementOpposingReview.id,
    playbook_snapshot: JSON.stringify(BUILT_IN_PLAYBOOKS.implementOpposingReview), current_step_id: 'implement', step_pass_counts: null,
    paused_reason: null, step_outputs: null, initial_instructions: 'Implement task', work_brief_revision: 1,
    pr_number: null, pr_url: null, pr_state: null, review_state: null, pr_is_draft: false, merge_order: null,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', completed_at: null,
  };
}

describe('playbook step runner', () => {
  it('persists the next cursor before it dispatches the next step', async () => {
    const session = createSession();
    const transition = vi.fn();
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const playbook = BUILT_IN_PLAYBOOKS.implementOpposingReview;
    const implement = playbook.steps[0];

    const runner = createPlaybookStepRunner({
      phaseMachine: { transition },
      planService: { updateItem: vi.fn() },
      getDevSessionService: () => ({ get: vi.fn(() => session) }),
      getReviewService: () => null,
      requestPlanRefresh: vi.fn(),
      dispatch,
    });

    await runner.settle({ session, playbook, step: implement, findings: [] });

    expect(transition).toHaveBeenCalledWith(session.id, expect.objectContaining({
      type: 'stepCompleted', stepId: 'implement', nextStepId: 'review', nextPhase: 'reviewing',
    }));
    expect(dispatch).toHaveBeenCalledWith(session, playbook, playbook.steps[1], []);
  });

  it('moves the plan item to review once the last step completes with no PR', async () => {
    const session = createSession();
    const transition = vi.fn();
    const updateItem = vi.fn().mockReturnValue({ ok: true });
    const requestPlanRefresh = vi.fn();
    const dispatch = vi.fn();
    const playbook = BUILT_IN_PLAYBOOKS.implementOpposingReview;
    const address = playbook.steps[2];

    const runner = createPlaybookStepRunner({
      phaseMachine: { transition },
      planService: { updateItem },
      getDevSessionService: () => ({ get: vi.fn(() => session) }),
      getReviewService: () => null,
      requestPlanRefresh,
      dispatch,
    });

    await runner.settle({ session, playbook, step: address, findings: [] });

    expect(transition).toHaveBeenCalledWith(session.id, expect.objectContaining({
      type: 'stepCompleted', stepId: 'address', nextStepId: null,
    }));
    expect(updateItem).toHaveBeenCalledWith(session.plan_item_id, { status_category: 'in_review' });
    expect(transition).toHaveBeenCalledWith(session.id, { type: 'movedToReview' });
    expect(requestPlanRefresh).toHaveBeenCalledWith(session.project_id);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('pauses instead of re-dispatching once a findings step exhausts its passes', async () => {
    const playbook = BUILT_IN_PLAYBOOKS.implementCodeReview;
    const review = playbook.steps.find((step) => step.id === 'review')!;
    const session = { ...createSession(), step_pass_counts: JSON.stringify({ review: 3 }) };
    const transition = vi.fn();
    const dispatch = vi.fn();

    const runner = createPlaybookStepRunner({
      phaseMachine: { transition },
      planService: { updateItem: vi.fn() },
      getDevSessionService: () => ({ get: vi.fn(() => session) }),
      getReviewService: () => null,
      requestPlanRefresh: vi.fn(),
      dispatch,
    });

    await runner.settle({
      session,
      playbook,
      step: review,
      findings: [{ severity: 'warning', description: 'Handle null input.', agent: 'codex', source: 'agent' }],
    });

    expect(transition).toHaveBeenCalledWith(session.id, {
      type: 'paused', stepId: 'review', reason: 'max_passes', stepPassCounts: { review: 3 },
    });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
