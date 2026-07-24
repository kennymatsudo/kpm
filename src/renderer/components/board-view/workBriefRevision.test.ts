import { describe, expect, it } from 'vitest';
import type { DevSessionWithPlanItem } from '../../../shared/types';
import {
  deriveStaleWorkBriefRevision,
  findReusableBoardSession,
} from './workBriefRevision';

function session(overrides: Partial<DevSessionWithPlanItem> = {}): DevSessionWithPlanItem {
  return {
    id: 'session-1',
    project_id: 'project-1',
    plan_item_id: 'item-1',
    repo_id: 'repo-1',
    name: null,
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
    paused_reason: null,
    initial_instructions: 'Captured brief',
    work_brief_revision: 2,
    pr_number: null,
    pr_url: null,
    pr_state: null,
    review_state: null,
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
      work_brief_revision: 3,
    },
    ...overrides,
  };
}

describe('deriveStaleWorkBriefRevision', () => {
  it('returns both revisions only when both are known and differ', () => {
    expect(deriveStaleWorkBriefRevision(2, 3)).toEqual({ executionRevision: 2, itemRevision: 3 });
    expect(deriveStaleWorkBriefRevision(3, 3)).toBeNull();
    expect(deriveStaleWorkBriefRevision(null, 3)).toBeNull();
    expect(deriveStaleWorkBriefRevision(2, null)).toBeNull();
  });
});

describe('findReusableBoardSession', () => {
  it('matches the service by considering only the latest session before repo and status checks', () => {
    const olderReusable = session({ id: 'older', created_at: '2026-01-01T10:00:00.000Z' });
    const latestDifferentRepo = session({
      id: 'latest',
      repo_id: 'repo-2',
      created_at: '2026-01-02T10:00:00.000Z',
    });

    expect(findReusableBoardSession([olderReusable, latestDifferentRepo], 'repo-1')).toBeNull();
    expect(findReusableBoardSession([latestDifferentRepo, olderReusable], 'repo-2')?.id).toBe('latest');
  });
});
