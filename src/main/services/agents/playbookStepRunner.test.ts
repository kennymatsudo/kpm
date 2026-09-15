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
});
