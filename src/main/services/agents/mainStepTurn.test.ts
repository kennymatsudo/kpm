import { describe, expect, it, vi } from 'vitest';
import type { DevSession } from '../../../shared/types';
import type { PlaybookStep } from '../../../shared/playbooks';
import { BUILT_IN_PLAYBOOKS } from '../../../shared/playbooks';
import { success } from '../result';
import { runMainStep } from './mainStepTurn';

const PROVIDER = { capabilities: { nativeSkills: false, reviewSandbox: false } };

function createSession(): DevSession {
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
    automation_phase: 'addressing_review',
    playbook_id: BUILT_IN_PLAYBOOKS.implementCodeReview.id,
    playbook_snapshot: JSON.stringify(BUILT_IN_PLAYBOOKS.implementCodeReview),
    current_step_id: 'address',
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
  };
}

function createDeps() {
  return {
    getPromptContent: vi.fn((key: string) => `content:${key}`),
    getSkillBody: vi.fn(() => success('skill body')),
    sendAgentFollowUp: vi.fn().mockResolvedValue({ ok: true, data: { restarted: true } }),
    startAgentSession: vi.fn().mockResolvedValue({ ok: true, data: { session: createSession() } }),
  };
}

const ADDRESS_STEP: PlaybookStep = {
  id: 'address',
  session: 'main',
  systemPromptKey: 'agents.review_assessment_role',
  directive: { kind: 'prompt', text: 'Fix the findings:\n{{findings}}' },
};

describe('runMainStep', () => {
  it('re-enters a restarted turn at the step it is on, not the playbook first step', async () => {
    const deps = createDeps();

    const result = await runMainStep(deps, {
      session: createSession(),
      step: ADDRESS_STEP,
      provider: PROVIDER,
      findings: '1. [warning] src/app.ts:1',
    });

    expect(result).toEqual({ ok: true, data: { status: 'started' } });
    expect(deps.startAgentSession).not.toHaveBeenCalled();
    expect(deps.sendAgentFollowUp).toHaveBeenCalledWith(
      'session-1',
      expect.stringContaining('1. [warning] src/app.ts:1'),
      { restartAs: { systemPromptKey: 'agents.review_assessment_role', phase: 'addressing_review' } },
    );
  });

  it('opens a run with the task context and the write policy', async () => {
    const deps = createDeps();
    const implement = BUILT_IN_PLAYBOOKS.implementCodeReview.steps[0];

    const result = await runMainStep(deps, {
      session: createSession(),
      step: implement,
      provider: PROVIDER,
      launch: { taskContext: 'Task contract', model: 'sonnet' },
    });

    expect(result).toEqual({ ok: true, data: { status: 'started' } });
    expect(deps.sendAgentFollowUp).not.toHaveBeenCalled();
    expect(deps.startAgentSession).toHaveBeenCalledWith('session-1', expect.objectContaining({
      prompt: expect.stringContaining('Task contract'),
      model: 'sonnet',
      systemPromptKey: 'agents.implementation_tdd_system',
    }));
    expect(deps.startAgentSession.mock.calls[0][1].prompt).toContain('Do not create commits');
  });

  it('blocks the step when a skill the provider cannot invoke natively is missing', async () => {
    const deps = createDeps();
    deps.getSkillBody.mockReturnValue({ ok: false, error: 'Skill not found: code-review' } as never);

    const result = await runMainStep(deps, {
      session: createSession(),
      step: { id: 'audit', session: 'main', directive: { kind: 'skill', name: 'code-review' } },
      provider: PROVIDER,
    });

    expect(result).toEqual({
      ok: true,
      data: { status: 'blocked', reason: 'skill-unavailable:audit', message: 'Skill not found: code-review' },
    });
    expect(deps.sendAgentFollowUp).not.toHaveBeenCalled();
  });
});
