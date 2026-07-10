import { describe, expect, it } from 'vitest';
import type { Database } from 'better-sqlite3';
import { createTestDb } from '../../testing/createTestDb';
import { AgentReviewRepository } from './AgentReviewRepository';

function seedDevSession(db: Database): void {
  db.prepare(`INSERT INTO projects (id, name, folder_path) VALUES (?, ?, ?)`).run(
    'project-1',
    'Test Project',
    '/tmp/test-project'
  );
  db.prepare(`INSERT INTO repos (id, project_id, path) VALUES (?, ?, ?)`).run(
    'repo-1',
    'project-1',
    '/tmp/test-project/repo'
  );
  db.prepare(`
    INSERT INTO dev_sessions (id, project_id, repo_id, worktree_path, branch_name)
    VALUES (?, ?, ?, ?, ?)
  `).run('session-1', 'project-1', 'repo-1', '/tmp/test-project/worktree', 'feature/test');
}

describe('AgentReviewRepository', () => {
  it('updates a running review row when the review completes', () => {
    const db = createTestDb();
    try {
      seedDevSession(db);
      const repo = new AgentReviewRepository(db);

      const started = repo.persistStartedReview({
        implementation_session_id: 'session-1',
        review_session_id: 'session-1-review',
        reviewer_agent: 'codex',
      });

      expect(started.status).toBe('running');
      expect(started.completed_at).toBeNull();

      const completed = repo.persistCompletedReview({
        implementation_session_id: 'session-1',
        review_session_id: 'session-1-review',
        reviewer_agent: 'codex',
        raw_output: '{"findings":[]}',
        findings: [],
      });

      expect(completed.id).toBe(started.id);
      expect(completed.status).toBe('complete');
      expect(completed.error).toBeNull();
      expect(completed.raw_output).toBe('{"findings":[]}');
      expect(completed.completed_at).not.toBeNull();
      expect(repo.getReviewerAgentsByImplementationSessionIds(['session-1']).get('session-1')).toEqual(['codex']);
    } finally {
      db.close();
    }
  });

  it('keeps parallel run rows independent and reconstructs their outputs and findings', () => {
    const db = createTestDb();
    try {
      seedDevSession(db);
      const repo = new AgentReviewRepository(db);
      const ids = ['session-1-playbook-critic-0-0', 'session-1-playbook-critic-0-1'];
      ids.forEach((reviewSessionId, runIndex) => repo.persistStartedReview({
        implementation_session_id: 'session-1',
        review_session_id: reviewSessionId,
        reviewer_agent: runIndex === 0 ? 'codex' : 'claude',
        step_id: 'critic',
        run_index: runIndex,
      }));

      repo.persistCompletedReview({
        implementation_session_id: 'session-1',
        review_session_id: ids[0],
        reviewer_agent: 'codex',
        raw_output: 'first output',
        step_id: 'critic',
        run_index: 0,
        findings: [{ severity: 'warning', description: 'First finding', agent: 'codex', source: 'agent' }],
      });

      const reconstructed = repo.getByReviewSessionIds(ids).sort((a, b) => (a.run_index ?? 0) - (b.run_index ?? 0));
      expect(reconstructed.map((run) => run.status)).toEqual(['complete', 'running']);
      expect(reconstructed[0]).toMatchObject({ raw_output: 'first output', findings: [{ description: 'First finding' }] });
      expect(reconstructed[1].findings).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('updates a running review row when the review fails', () => {
    const db = createTestDb();
    try {
      seedDevSession(db);
      const repo = new AgentReviewRepository(db);

      const started = repo.persistStartedReview({
        implementation_session_id: 'session-1',
        review_session_id: 'session-1-review',
        reviewer_agent: 'codex',
      });

      const failed = repo.persistFailedReview({
        implementation_session_id: 'session-1',
        review_session_id: 'session-1-review',
        reviewer_agent: 'codex',
        raw_output: 'not json',
        error: 'Review agent returned invalid JSON',
      });

      expect(failed.id).toBe(started.id);
      expect(failed.status).toBe('failed');
      expect(failed.error).toBe('Review agent returned invalid JSON');
      expect(failed.raw_output).toBe('not json');
      expect(failed.completed_at).not.toBeNull();
      expect(repo.getReviewerAgentsByImplementationSessionIds(['session-1']).get('session-1')).toBeUndefined();
    } finally {
      db.close();
    }
  });
});
