import { describe, expect, it } from 'vitest';
import type { DevSessionWithPlanItem } from '../../../shared/types';
import { isMergeQueueSession } from './mergeQueue';

function session(overrides: Partial<DevSessionWithPlanItem> = {}): DevSessionWithPlanItem {
  return {
    id: 'session-1',
    project_id: 'project-1',
    plan_item_id: 'item-1',
    repo_id: 'repo-1',
    name: 'Session',
    worktree_path: '/tmp/worktree',
    branch_name: 'work',
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
    step_outputs: null,
    paused_reason: null,
    initial_instructions: 'Do it',
    work_brief_revision: 1,
    pr_number: 42,
    pr_url: 'https://github.com/test/repo/pull/42',
    pr_state: 'OPEN',
    review_state: null,
    pr_is_draft: false,
    merge_order: null,
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T10:00:00.000Z',
    completed_at: null,
    repo_name: 'repo',
    plan_item: {
      id: 'item-1',
      title: 'Item',
      description: null,
      label: null,
      external_key: null,
      status_category: 'in_review',
      work_brief_revision: 1,
    },
    ...overrides,
  };
}

describe('isMergeQueueSession', () => {
  it('excludes sessions whose linked plan item is done', () => {
    expect(isMergeQueueSession(session({
      plan_item: {
        id: 'item-1',
        title: 'Item',
        description: null,
        label: null,
        external_key: null,
        status_category: 'done',
        work_brief_revision: 1,
      },
    }))).toBe(false);
  });

  it('includes open PR sessions that are not done', () => {
    expect(isMergeQueueSession(session())).toBe(true);
  });

  it('excludes draft PR sessions', () => {
    expect(isMergeQueueSession(session({ pr_is_draft: true }))).toBe(false);
  });
});
