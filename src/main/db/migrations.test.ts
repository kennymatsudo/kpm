import { describe, expect, it } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { migrations, runMigrations } from './migrations';
import { sqliteHasFts5 } from './testing/createTestDb';
import { ActionRepository } from './repositories/impl/ActionRepository';
import { getActionValidationIssues, toEditable } from '../../shared/actions';

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

describe('actions migrations (115-118)', () => {
  const PROJECT_ID = '33333333-3333-4333-8333-333333333333';

  /** Applies migrations in order up to and including `maxId`. */
  function migrateThrough(db: BetterSqlite3.Database, maxId: number): void {
    for (const migration of migrations) {
      if (migration.id <= maxId) migration.up(db);
    }
  }

  function apply(db: BetterSqlite3.Database, id: number): void {
    migrations.find((migration) => migration.id === id)?.up(db);
  }

  /**
   * Seeds the pre-merge state: migrations up to 114 leave `custom_prompts` and
   * `scheduled_loops` in place, so legacy rows can be planted before 115 runs.
   */
  function seedLegacy(db: BetterSqlite3.Database): void {
    migrateThrough(db, 1114);
    db.prepare('INSERT INTO projects (id, name, folder_path) VALUES (?, ?, ?)').run(
      PROJECT_ID,
      'Actions',
      '/tmp/actions'
    );
    db.prepare(`
      INSERT INTO custom_prompts (id, name, description, prompt_content, icon, keywords, target_type, run_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('cp-artifact', 'Test Plan', 'Draft one', 'Write a test plan.', 'clipboard', 'test,plan', 'none', 'artifact');
    db.prepare(`
      INSERT INTO custom_prompts (id, name, description, prompt_content, icon, keywords, target_type, run_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('cp-chat', 'Explain Doc', null, 'Explain this document.', 'document', null, 'document', 'chat');

    const insertLoop = db.prepare(`
      INSERT INTO scheduled_loops (id, project_id, name, prompt, output_mode, interval_minutes, enabled, memory, last_outcome)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertLoop.run('loop-notify', PROJECT_ID, 'Watch', 'Anything broken?', 'notify', 60, 1, 'seen abc', 'ok');
    insertLoop.run('loop-report', PROJECT_ID, 'Digest', 'Summarize.', 'report', 1440, 0, null, null);
    insertLoop.run('loop-maintain', PROJECT_ID, 'Tidy docs', 'Fix drift.', 'maintain', 240, 1, null, null);

    const insertRun = db.prepare(`
      INSERT INTO loop_runs (id, loop_id, outcome, summary, started_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertRun.run('run-1', 'loop-notify', 'ok', 'found something', '2026-07-20T00:00:00.000Z');
    insertRun.run('run-2', 'loop-notify', 'no_op', null, '2026-07-21T00:00:00.000Z');
  }

  /** Seed, then run the whole actions sequence except the table drop. */
  function migrateToActions(db: BetterSqlite3.Database): void {
    seedLegacy(db);
    apply(db, 1115);
    apply(db, 1116);
    apply(db, 1117);
  }

  it('backfills custom prompts as manual actions, preserving ids and run mode', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      migrateToActions(db);

      const artifact = db.prepare('SELECT * FROM actions WHERE id = ?').get('cp-artifact') as Record<string, unknown>;
      expect(artifact).toMatchObject({
        name: 'Test Plan',
        project_id: null,
        trigger_kind: 'manual',
        manual_run: 'headless',
        target_type: 'none',
        keywords: 'test,plan',
      });
      expect(JSON.parse(artifact.capabilities as string)).toContain('write_outputs');

      const chat = db.prepare('SELECT * FROM actions WHERE id = ?').get('cp-chat') as Record<string, unknown>;
      expect(chat).toMatchObject({ manual_run: 'chat', target_type: 'document', description: '', keywords: '' });
      expect(JSON.parse(chat.capabilities as string)).not.toContain('write_outputs');
    } finally {
      db.close();
    }
  });

  it('backfills each loop output mode as the equivalent capability grant', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      seedLegacy(db);
      apply(db, 1115);

      const rows = db.prepare('SELECT id, capabilities, trigger_kind, trigger_interval_minutes, enabled, project_id, memory FROM actions WHERE id LIKE ?').all('loop-%') as Record<string, unknown>[];
      const byId = new Map(rows.map((row) => [row.id as string, row]));

      expect(JSON.parse(byId.get('loop-notify')!.capabilities as string)).toContain('report_finding');
      expect(JSON.parse(byId.get('loop-report')!.capabilities as string)).toContain('write_outputs');
      expect(JSON.parse(byId.get('loop-maintain')!.capabilities as string)).toContain('propose_documents');

      expect(byId.get('loop-notify')).toMatchObject({
        trigger_kind: 'interval',
        trigger_interval_minutes: 60,
        project_id: PROJECT_ID,
        memory: 'seen abc',
      });

      // Nothing arrives enabled — 117 is what moves the live schedules across.
      for (const row of rows) expect(row.enabled).toBe(0);
    } finally {
      db.close();
    }
  });

  it('converts a maintain loop into a manual chat action, since its edits now need review', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      migrateToActions(db);

      expect(db.prepare('SELECT * FROM actions WHERE id = ?').get('loop-maintain')).toMatchObject({
        trigger_kind: 'manual',
        trigger_interval_minutes: null,
        manual_run: 'chat',
        prompt: 'Fix drift.',
      });
    } finally {
      db.close();
    }
  });

  it('repoints run history onto the migrated action', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      seedLegacy(db);
      apply(db, 1115);

      const runs = db.prepare('SELECT id, action_id, outcome FROM action_runs ORDER BY started_at').all() as Record<string, unknown>[];
      expect(runs).toEqual([
        { id: 'run-1', action_id: 'loop-notify', outcome: 'ok' },
        { id: 'run-2', action_id: 'loop-notify', outcome: 'no_op' },
      ]);
    } finally {
      db.close();
    }
  });

  it('adopts previously-enabled loop schedules once the legacy runner retires', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      migrateToActions(db);

      const byId = new Map(
        (db.prepare('SELECT id, enabled, trigger_kind FROM actions').all() as Record<string, unknown>[])
          .map((row) => [row.id as string, row])
      );

      // loop-notify was enabled; loop-report was paused.
      expect(byId.get('loop-notify')?.enabled).toBe(1);
      expect(byId.get('loop-report')?.enabled).toBe(0);
      // loop-maintain became manual, so there is no trigger to adopt.
      expect(byId.get('loop-maintain')).toMatchObject({ trigger_kind: 'manual', enabled: 0 });
    } finally {
      db.close();
    }
  });

  it('produces rows that satisfy the action schema', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      migrateToActions(db);

      const repo = new ActionRepository(db);
      const migrated = repo.listForProject(PROJECT_ID);
      expect(migrated).toHaveLength(5);

      for (const action of migrated) {
        expect(getActionValidationIssues(toEditable(action))).toEqual([]);
      }
    } finally {
      db.close();
    }
  });

  it('drops the legacy tables once nothing reads them', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      migrateToActions(db);
      apply(db, 1118);

      const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[])
        .map((row) => row.name);
      expect(tables).not.toContain('custom_prompts');
      expect(tables).not.toContain('scheduled_loops');
      expect(tables).not.toContain('loop_runs');

      // The migrated rows and their history survive the drop.
      expect(db.prepare('SELECT COUNT(*) AS n FROM actions').get()).toEqual({ n: 5 });
      expect(db.prepare('SELECT COUNT(*) AS n FROM action_runs').get()).toEqual({ n: 2 });
    } finally {
      db.close();
    }
  });

  it('backfills a snapshot onto sessions that predate playbook persistence', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      migrateThrough(db, 1123);
      db.prepare('INSERT INTO projects (id, name, folder_path) VALUES (?, ?, ?)').run(
        'proj-legacy', 'Legacy', '/tmp/proj-legacy'
      );
      db.prepare('INSERT INTO plan_items (id, project_id, title, item_order) VALUES (?, ?, ?, ?)').run(
        'item-legacy', 'proj-legacy', 'Legacy task', 0
      );
      db.prepare('INSERT INTO repos (id, project_id, path) VALUES (?, ?, ?)').run(
        'repo-legacy', 'proj-legacy', '/tmp/repo'
      );
      const insertSession = db.prepare(`
        INSERT INTO dev_sessions (
          id, project_id, plan_item_id, repo_id, name, worktree_path, branch_name,
          base_branch, status, agent_type, review_policy, initial_instructions
        ) VALUES (?, 'proj-legacy', 'item-legacy', 'repo-legacy', 'Legacy', '/tmp/wt', 'feat/x', 'main', 'inactive', 'claude', ?, 'Do the work')
      `);
      insertSession.run('session-skip', 'skip');
      insertSession.run('session-auto', 'auto');

      apply(db, 1124);

      const rows = db.prepare('SELECT id, playbook_snapshot FROM dev_sessions ORDER BY id').all() as {
        id: string;
        playbook_snapshot: string;
      }[];
      expect(rows.map((row) => JSON.parse(row.playbook_snapshot).id)).toEqual([
        'builtin.implement_opposing_review',
        'builtin.implement_only',
      ]);
    } finally {
      db.close();
    }
  });

  it('leaves no legacy tables behind on a fresh install', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      runMigrations(db);
      const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[])
        .map((row) => row.name);
      expect(tables).toContain('actions');
      expect(tables).toContain('action_runs');
      expect(tables).not.toContain('scheduled_loops');
    } finally {
      db.close();
    }
  });
});
