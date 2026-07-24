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

  it('round-trips the immutable captured revision and keeps legacy null valid', () => {
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
});
