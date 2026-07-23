import { describe, expect, it } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { migrations, runMigrations } from './migrations';
import { sqliteHasFts5 } from './testing/createTestDb';

const describeIfFts = sqliteHasFts5() ? describe : describe.skip;

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

describe('103_execution_playbook_persistence', () => {
  it('adds playbook cursor columns, maps legacy usage, and preserves foreign keys', () => {
    const db = new BetterSqlite3(':memory:');

    try {
      expect(() => runMigrations(db)).not.toThrow();

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

      expect(() => db.prepare(`
        INSERT INTO dev_sessions (
          id, project_id, repo_id, worktree_path, branch_name, base_branch,
          status, initial_instructions, automation_phase, current_step_id, paused_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'session-1',
        'proj-1',
        'repo-1',
        '/tmp/proj-1/worktree',
        'feature/test',
        'main',
        'inactive',
        'Implement feature',
        'paused',
        'review',
        'gate'
      )).not.toThrow();

      db.prepare(`
        INSERT INTO claude_usage_events (
          id, project_id, source, model, input_tokens, output_tokens,
          cache_creation_tokens, cache_read_tokens, cost_micro_usd, step_id, run_index,
          dev_session_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('usage-1', 'proj-1', 'board_playbook', 'sonnet', 1, 1, 0, 0, 1, 'review', 0, 'session-1');

      const session = db.prepare('SELECT automation_phase, current_step_id, paused_reason FROM dev_sessions WHERE id = ?').get('session-1') as {
        automation_phase: string;
        current_step_id: string;
        paused_reason: string;
      };
      expect(session).toEqual({ automation_phase: 'paused', current_step_id: 'review', paused_reason: 'gate' });

      const usage = db.prepare('SELECT source, step_id, run_index, dev_session_id FROM claude_usage_events WHERE id = ?').get('usage-1') as {
        source: string;
        step_id: string;
        run_index: number;
        dev_session_id: string;
      };
      expect(usage).toEqual({ source: 'board_playbook', step_id: 'review', run_index: 0, dev_session_id: 'session-1' });
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      db.close();
    }
  });
});

describe('101_drop_chat_sessions_provider_check', () => {
  it('applies cleanly and allows inserting a chat_sessions row with provider = pi', () => {
    const db = new BetterSqlite3(':memory:');

    try {
      expect(() => runMigrations(db)).not.toThrow();

      db.prepare('INSERT INTO projects (id, name, folder_path) VALUES (?, ?, ?)').run(
        'proj-1',
        'Project One',
        '/tmp/proj-1'
      );

      expect(() =>
        db.prepare(
          'INSERT INTO chat_sessions (id, project_id, provider) VALUES (?, ?, ?)'
        ).run('session-1', 'proj-1', 'pi')
      ).not.toThrow();

      const row = db.prepare('SELECT provider FROM chat_sessions WHERE id = ?').get('session-1') as { provider: string };
      expect(row.provider).toBe('pi');

      const columns = db.prepare('PRAGMA table_info(chat_sessions)').all() as { name: string }[];
      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining([
          'id', 'project_id', 'claude_session_id', 'created_at', 'title', 'scope',
          'focus_document_path', 'focus_document_title', 'focus_document_hash',
          'last_opened_at', 'provider', 'provider_session_id',
        ])
      );

      const violations = db.prepare('PRAGMA foreign_key_check').all();
      expect(violations).toEqual([]);
    } finally {
      db.close();
    }
  });
});

describe('review table migrations', () => {
  it('drops orphaned agent review runs when rebuilding review tables', () => {
    const db = new BetterSqlite3(':memory:');

    try {
      db.exec(`
        CREATE TABLE schema_migrations (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE dev_sessions (
          id TEXT PRIMARY KEY
        );

        CREATE TABLE agent_review_runs (
          id TEXT PRIMARY KEY,
          implementation_session_id TEXT NOT NULL REFERENCES dev_sessions(id) ON DELETE CASCADE,
          review_session_id TEXT NOT NULL,
          reviewer_agent TEXT NOT NULL CHECK(reviewer_agent IN ('claude', 'codex', 'gemini')),
          status TEXT NOT NULL CHECK(status IN ('complete', 'stale')),
          diff_fingerprint TEXT,
          raw_output TEXT,
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
      `);

      const recordMigration = db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)');
      const pendingUnderTest = new Set([
        '092_agent_review_running_failed_states',
        '093_dev_session_workflow_controls',
      ]);
      for (const migration of migrations) {
        if (!pendingUnderTest.has(migration.name)) {
          recordMigration.run(migration.id, migration.name);
        }
      }

      db.prepare('INSERT INTO dev_sessions (id) VALUES (?)').run('session-1');
      db.prepare(`
        INSERT INTO agent_review_runs (
          id, implementation_session_id, review_session_id, reviewer_agent, status, raw_output
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'review-run-valid',
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
        'review-finding-valid',
        'review-run-valid',
        0,
        'warning',
        'src/file.ts',
        12,
        'Needs stronger validation.',
        'codex',
        'agent'
      );

      db.pragma('foreign_keys = OFF');
      db.prepare(`
        INSERT INTO agent_review_runs (
          id, implementation_session_id, review_session_id, reviewer_agent, status, raw_output
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'review-run-orphan',
        'deleted-session',
        'deleted-session-review',
        'codex',
        'stale',
        '{"findings":[]}'
      );
      db.prepare(`
        INSERT INTO agent_review_findings (
          id, review_run_id, finding_order, severity, file, line, description, agent, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'review-finding-orphan',
        'review-run-orphan',
        0,
        'warning',
        'src/deleted.ts',
        1,
        'Belongs to a deleted session.',
        'codex',
        'agent'
      );
      db.pragma('foreign_keys = ON');

      expect(() => runMigrations(db)).not.toThrow();

      const runIds = db.prepare('SELECT id FROM agent_review_runs ORDER BY id').all() as { id: string }[];
      const findingIds = db.prepare('SELECT id FROM agent_review_findings ORDER BY id').all() as { id: string }[];
      const columns = db.prepare('PRAGMA table_info(dev_sessions)').all() as { name: string }[];
      const violations = db.prepare('PRAGMA foreign_key_check').all();

      expect(runIds).toEqual([{ id: 'review-run-valid' }]);
      expect(findingIds).toEqual([{ id: 'review-finding-valid' }]);
      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining(['execution_mode', 'review_policy'])
      );
      expect(violations).toEqual([]);
    } finally {
      db.close();
    }
  });
});

describe('107_outbound_change_deletion_sync', () => {
  it('recreates sync_queue as outbound_changes, preserving rows and widening the schema', () => {
    const db = new BetterSqlite3(':memory:');

    try {
      db.exec(`
        CREATE TABLE schema_migrations (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE sync_queue (
          id TEXT PRIMARY KEY,
          kpm_project_id TEXT NOT NULL,
          plan_item_id TEXT NOT NULL,
          association_id TEXT NOT NULL,
          operation TEXT NOT NULL CHECK(operation IN ('create', 'update')),
          target_issue_type_id TEXT,
          target_issue_type_name TEXT,
          target_parent_key TEXT,
          target_status_category TEXT,
          queued_by TEXT NOT NULL CHECK(queued_by IN ('user', 'claude')),
          queued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          error_message TEXT,
          custom_field_overrides TEXT,
          UNIQUE(plan_item_id)
        );
      `);

      // Record every migration except the one under test as already applied, so
      // runMigrations only runs 107 against the seeded old-shape table.
      const recordMigration = db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)');
      for (const migration of migrations) {
        if (migration.name !== '107_outbound_change_deletion_sync') {
          recordMigration.run(migration.id, migration.name);
        }
      }

      const insertOld = db.prepare(
        `INSERT INTO sync_queue (id, kpm_project_id, plan_item_id, association_id, operation, queued_by) VALUES (?, ?, ?, ?, ?, ?)`
      );
      insertOld.run('sq-1', 'proj-1', 'item-1', 'assoc-1', 'create', 'user');
      insertOld.run('sq-2', 'proj-1', 'item-2', 'assoc-1', 'update', 'user');

      expect(() => runMigrations(db)).not.toThrow();

      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('sync_queue', 'outbound_changes')"
      ).all() as { name: string }[];
      expect(tables.map((t) => t.name)).toEqual(['outbound_changes']);

      const rowCount = db.prepare('SELECT COUNT(*) AS count FROM outbound_changes').get() as { count: number };
      expect(rowCount.count).toBe(2);

      const columns = db.prepare('PRAGMA table_info(outbound_changes)').all() as { name: string; notnull: number }[];
      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining(['external_key', 'external_id', 'tracker_type'])
      );
      expect(columns.find((column) => column.name === 'plan_item_id')?.notnull).toBe(0);

      // A detached delete row proves both the widened CHECK and the now-nullable plan_item_id.
      expect(() =>
        db.prepare(
          `INSERT INTO outbound_changes (id, kpm_project_id, plan_item_id, association_id, operation, external_key, external_id, tracker_type, queued_by)
           VALUES (?, ?, NULL, ?, 'delete', ?, ?, ?, ?)`
        ).run('oc-del-1', 'proj-1', 'assoc-1', 'ENG-1', 'issue-1', 'linear', 'user')
      ).not.toThrow();
    } finally {
      db.close();
    }
  });
});

describe('111_chat_model_choice', () => {
  it('adds nullable legacy choice/model columns and a zero revision', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      runMigrations(db);
      db.prepare('INSERT INTO projects (id, name, folder_path) VALUES (?, ?, ?)').run('p-choice', 'Choice', '/tmp/choice');
      db.prepare('INSERT INTO chat_sessions (id, project_id, provider) VALUES (?, ?, ?)').run('c-choice', 'p-choice', 'claude');
      db.prepare(`
        INSERT INTO chat_messages (id, session_id, chat_session_id, role, content, provider)
        VALUES (?, ?, ?, 'assistant', 'legacy', 'claude')
      `).run('m-choice', 'p-choice', 'c-choice');

      const session = db.prepare(`
        SELECT chat_model_choice, chat_model_choice_revision FROM chat_sessions WHERE id = ?
      `).get('c-choice') as { chat_model_choice: string | null; chat_model_choice_revision: number };
      const message = db.prepare('SELECT model FROM chat_messages WHERE id = ?').get('m-choice') as { model: string | null };
      expect(session).toEqual({ chat_model_choice: null, chat_model_choice_revision: 0 });
      expect(message.model).toBeNull();
    } finally {
      db.close();
    }
  });
});
