import { describe, expect, it } from 'vitest';
import BetterSqlite3, { type Database } from 'better-sqlite3';
import { AgentReviewRepository } from './AgentReviewRepository';

function setupReviewSchema(db: Database): void {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE dev_sessions (
      id TEXT PRIMARY KEY
    );

    CREATE TABLE agent_review_runs (
      id TEXT PRIMARY KEY,
      implementation_session_id TEXT NOT NULL REFERENCES dev_sessions(id) ON DELETE CASCADE,
      review_session_id TEXT NOT NULL,
      reviewer_agent TEXT NOT NULL CHECK(reviewer_agent IN ('claude', 'codex', 'gemini')),
      status TEXT NOT NULL CHECK(status IN ('running', 'complete', 'failed', 'stale')),
      diff_fingerprint TEXT,
      raw_output TEXT,
      error TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE agent_review_findings (
      id TEXT PRIMARY KEY,
      review_run_id TEXT NOT NULL REFERENCES agent_review_runs(id) ON DELETE CASCADE,
      finding_order INTEGER NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('critical', 'warning', 'suggestion')),
      file TEXT NOT NULL,
      line INTEGER,
      description TEXT NOT NULL,
      agent TEXT NOT NULL CHECK(agent IN ('claude', 'codex', 'gemini')),
      source TEXT NOT NULL CHECK(source IN ('agent', 'pr')),
      UNIQUE(review_run_id, finding_order)
    );

    CREATE INDEX idx_agent_review_runs_implementation
      ON agent_review_runs(implementation_session_id, completed_at DESC, created_at DESC);
    CREATE INDEX idx_agent_review_runs_status
      ON agent_review_runs(implementation_session_id, status);
    CREATE INDEX idx_agent_review_findings_run
      ON agent_review_findings(review_run_id, finding_order);
  `);

  db.prepare('INSERT INTO dev_sessions (id) VALUES (?)').run('session-1');
}

describe('AgentReviewRepository', () => {
  it('updates a running review row when the review completes', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      setupReviewSchema(db);
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

  it('updates a running review row when the review fails', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      setupReviewSchema(db);
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
