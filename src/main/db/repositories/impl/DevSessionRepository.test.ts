import type { Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../testing/createTestDb';
import { DevSessionRepository } from './DevSessionRepository';

describe('DevSessionRepository Work Brief revision', () => {
  let db: Database;
  let repository: DevSessionRepository;

  beforeEach(() => {
    db = createTestDb();
    db.prepare('INSERT INTO projects (id, name, folder_path) VALUES (?, ?, ?)').run('project-1', 'Project', '/tmp/project');
    db.prepare('INSERT INTO repos (id, project_id, path) VALUES (?, ?, ?)').run('repo-1', 'project-1', '/tmp/repo');
    repository = new DevSessionRepository(db);
  });

  afterEach(() => db.close());

  it('round-trips the captured revision and keeps legacy null valid', () => {
    const base = {
      project_id: 'project-1', plan_item_id: null, repo_id: 'repo-1', name: 'Session',
      worktree_path: '/tmp/worktree', branch_name: 'work', base_branch: 'main', base_sha: null,
      status: 'pending' as const, agent_type: 'claude' as const, review_policy: 'auto' as const,
      automation_phase: null, playbook_id: null, playbook_snapshot: null, current_step_id: null,
      step_pass_counts: null, step_outputs: null, paused_reason: null, initial_instructions: 'Contract',
      pr_number: null, pr_url: null, pr_state: null, review_state: null, merge_order: null,
    };

    repository.create({ id: 'session-known', ...base, work_brief_revision: 3 });
    repository.create({ id: 'session-legacy', ...base, work_brief_revision: null });

    expect(repository.get('session-known')?.work_brief_revision).toBe(3);
    expect(repository.get('session-legacy')?.work_brief_revision).toBeNull();
  });

  it('updates the delivered Work Brief and revision together', () => {
    repository.create({
      id: 'session-current',
      project_id: 'project-1',
      plan_item_id: null,
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
      initial_instructions: 'Revision 1',
      work_brief_revision: 1,
      pr_number: null,
      pr_url: null,
      pr_state: null,
      review_state: null,
      merge_order: null,
    });

    repository.updateWorkBriefSnapshot('session-current', 'Revision 2', 2);

    expect(repository.get('session-current')).toMatchObject({
      initial_instructions: 'Revision 2',
      work_brief_revision: 2,
    });
  });

  it('persists and clears the automation failure reason', () => {
    const session = repository.create({
      id: 'session-attention',
      project_id: 'project-1',
      plan_item_id: null,
      repo_id: 'repo-1',
      name: 'Session',
      worktree_path: '/tmp/worktree',
      branch_name: 'work',
      base_branch: 'main',
      base_sha: null,
      status: 'inactive',
      agent_type: 'claude',
      review_policy: 'auto',
      automation_phase: 'needs_attention',
      playbook_id: null,
      playbook_snapshot: null,
      current_step_id: 'review',
      step_pass_counts: null,
      step_outputs: null,
      paused_reason: null,
      attention_reason: 'opposing-review-errored',
      initial_instructions: 'Contract',
      work_brief_revision: null,
      pr_number: null,
      pr_url: null,
      pr_state: null,
      review_state: null,
      merge_order: null,
    });

    expect(session.attention_reason).toBe('opposing-review-errored');

    repository.updateAutomationState(session.id, {
      phase: 'reviewing',
      attentionReason: null,
    });

    expect(repository.get(session.id)?.attention_reason).toBeNull();
  });
});
