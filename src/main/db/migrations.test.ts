import { describe, expect, it } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';

const FTS5_AVAILABLE = (() => {
  const db = new BetterSqlite3(':memory:');
  try {
    const row = db.prepare(
      "SELECT sqlite_compileoption_used('ENABLE_FTS5') as enabled"
    ).get() as { enabled: number };
    return row.enabled === 1;
  } catch {
    return false;
  } finally {
    db.close();
  }
})();

const describeIfFts = FTS5_AVAILABLE ? describe : describe.skip;

describeIfFts('runMigrations', () => {
  it('allows duplicate document paths across different projects', () => {
    const db = new BetterSqlite3(':memory:');

    try {
      runMigrations(db);

      db.prepare('INSERT INTO projects (id, name, folder_path) VALUES (?, ?, ?)').run(
        'proj-1',
        'Project One',
        '/tmp/proj-1'
      );
      db.prepare('INSERT INTO projects (id, name, folder_path) VALUES (?, ?, ?)').run(
        'proj-2',
        'Project Two',
        '/tmp/proj-2'
      );

      const insertDoc = db.prepare(`
        INSERT INTO global_search_index (
          entity_type, entity_id, project_id, title, body, updated_at
        ) VALUES ('document', ?, ?, ?, ?, ?)
      `);

      expect(() =>
        insertDoc.run(
          'README.md',
          'proj-1',
          'Project One Readme',
          'alpha',
          '2026-04-13T00:00:00.000Z'
        )
      ).not.toThrow();

      expect(() =>
        insertDoc.run(
          'README.md',
          'proj-2',
          'Project Two Readme',
          'beta',
          '2026-04-13T00:00:01.000Z'
        )
      ).not.toThrow();

      const rows = db.prepare(`
        SELECT project_id, title, body
        FROM global_search_index
        WHERE entity_type = 'document' AND entity_id = 'README.md'
        ORDER BY project_id
      `).all() as { project_id: string; title: string; body: string }[];

      expect(rows).toEqual([
        { project_id: 'proj-1', title: 'Project One Readme', body: 'alpha' },
        { project_id: 'proj-2', title: 'Project Two Readme', body: 'beta' },
      ]);
    } finally {
      db.close();
    }
  });

  it('cascades persisted agent reviews when a dev session is deleted', () => {
    const db = new BetterSqlite3(':memory:');

    try {
      runMigrations(db);

      db.prepare('INSERT INTO projects (id, name, folder_path) VALUES (?, ?, ?)').run(
        'proj-1',
        'Project One',
        '/tmp/proj-1'
      );
      db.prepare('INSERT INTO repos (id, project_id, path) VALUES (?, ?, ?)').run(
        'repo-1',
        'proj-1',
        '/tmp/proj-1/repo'
      );
      db.prepare(`
        INSERT INTO dev_sessions (
          id, project_id, plan_item_id, repo_id, worktree_path, branch_name, base_branch,
          status, initial_instructions, requested_mode, effective_mode
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'session-1',
        'proj-1',
        null,
        'repo-1',
        '/tmp/proj-1/worktree',
        'feature/test',
        'main',
        'inactive',
        'Implement feature',
        'solo',
        'solo'
      );

      db.prepare(`
        INSERT INTO agent_review_runs (
          id, implementation_session_id, review_session_id, reviewer_agent, status, raw_output
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'review-run-1',
        'session-1',
        'session-1-review',
        'codex',
        'complete',
        '{"findings":[]}'
      );
      db.prepare(`
        INSERT INTO agent_review_findings (
          id, review_run_id, finding_order, severity, file, line, description, agent, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'review-finding-1',
        'review-run-1',
        0,
        'warning',
        'src/file.ts',
        12,
        'Needs stronger validation.',
        'codex',
        'agent'
      );

      db.prepare('DELETE FROM dev_sessions WHERE id = ?').run('session-1');

      const runCount = db.prepare('SELECT COUNT(*) as count FROM agent_review_runs').get() as { count: number };
      const findingCount = db.prepare('SELECT COUNT(*) as count FROM agent_review_findings').get() as { count: number };

      expect(runCount.count).toBe(0);
      expect(findingCount.count).toBe(0);
    } finally {
      db.close();
    }
  });
});
