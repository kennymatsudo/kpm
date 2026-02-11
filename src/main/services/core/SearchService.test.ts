import { describe, it, expect, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import type { Database } from 'better-sqlite3';
import { createSearchService } from './SearchService';

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

function createTestDb(): Database {
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder_path TEXT
    );

    CREATE TABLE plan_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'planned',
      status_category TEXT,
      label TEXT,
      external_key TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      chat_session_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

  `);

  db.exec(`
    CREATE TABLE global_search_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      status_category TEXT,
      label TEXT,
      external_key TEXT,
      updated_at TEXT,
    );

    CREATE VIRTUAL TABLE global_search_fts USING fts5(
      title,
      body,
      content = 'global_search_index',
      content_rowid = 'id'
    );
  `);

  return db;
}

type SearchEntityType = 'plan_item' | 'document';

function insertSearchIndexRow(
  db: Database,
  input: {
    entityType: SearchEntityType;
    entityId: string;
    projectId: string;
    title: string;
    body?: string | null;
    statusCategory?: string | null;
    label?: string | null;
    externalKey?: string | null;
    updatedAt?: string | null;
  }
): void {
  db.prepare(`
    INSERT INTO global_search_index (
      entity_type, entity_id, project_id, title, body, status_category, label,
      external_key, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.entityType,
    input.entityId,
    input.projectId,
    input.title,
    input.body ?? null,
    input.statusCategory ?? null,
    input.label ?? null,
    input.externalKey ?? null,
    input.updatedAt ?? null
  );

  const row = db.prepare(`
    SELECT id, title, body FROM global_search_index

  db.prepare('INSERT INTO global_search_fts(rowid, title, body) VALUES (?, ?, ?)')
    .run(row.id, row.title, row.body ?? '');
}

const describeIfFts = FTS5_AVAILABLE ? describe : describe.skip;

describeIfFts('SearchService', () => {
  let db: Database;
  let service: ReturnType<typeof createSearchService>;
  const projectId = 'proj-1';

  beforeEach(() => {
    db = createTestDb();
    service = createSearchService({ getDatabase: () => db });

    db.prepare('INSERT INTO projects (id, name, folder_path) VALUES (?, ?, ?)').run(projectId, 'Test Project', '/tmp');

    db.prepare('INSERT INTO plan_items (id, project_id, title, description, status_category, label) VALUES (?, ?, ?, ?, ?, ?)').run(
      'item-1', projectId, 'Fix authentication bug', 'Users cannot login with OAuth tokens', 'in_progress', 'bug'
    );
    db.prepare('INSERT INTO plan_items (id, project_id, title, description, status_category) VALUES (?, ?, ?, ?, ?)').run(
      'item-2', projectId, 'Add search feature', 'Implement global search across entities', 'not_started'
    );
    insertSearchIndexRow(db, {
      entityType: 'plan_item',
      entityId: 'item-1',
      projectId,
      title: 'Fix authentication bug',
      body: 'Users cannot login with OAuth tokens',
      statusCategory: 'in_progress',
      label: 'bug',
    });
    insertSearchIndexRow(db, {
      entityType: 'plan_item',
      entityId: 'item-2',
      projectId,
      title: 'Add search feature',
      body: 'Implement global search across entities',
      statusCategory: 'not_started',
    });
    insertSearchIndexRow(db, {
      entityType: 'document',
      projectId,
      title: 'Architecture Overview',
      body: null,
    });
    insertSearchIndexRow(db, {
      entityType: 'plan_item',
      entityId: 'item-3',
      projectId,
      title: 'Need to investigate authentication timeout issues',
      body: 'Need to investigate authentication timeout issues',
      statusCategory: 'not_started',
    });
  });

  it('returns empty results for query with no matches', async () => {
    const result = await service.search(projectId, 'zzzznonexistent');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(0);
    }
  });

  it('returns failure for empty query', async () => {
    const result = await service.search(projectId, '  ');
    expect(result.ok).toBe(false);
  });

  it('returns failure when FTS index is unavailable', async () => {
    db.exec('DROP TABLE global_search_fts;');
    db.exec('DROP TABLE global_search_index;');

    const result = await service.search(projectId, 'authentication');
    expect(result.ok).toBe(false);
  });

  it('finds plan items by title', async () => {
    const result = await service.search(projectId, 'authentication');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const planResults = result.data.filter((r) => r.entityType === 'plan_item');
      expect(planResults.length).toBeGreaterThanOrEqual(1);
      expect(planResults[0].title).toBe('Fix authentication bug');
      expect(planResults[0].matchedField).toBe('title');
    }
  });

  it('finds plan items by description when title does not match', async () => {
    const result = await service.search(projectId, 'OAuth');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const planResults = result.data.filter((r) => r.entityType === 'plan_item');
      expect(planResults.length).toBe(1);
      expect(planResults[0].matchedField).toBe('description');
      expect(planResults[0].snippet).toBeTruthy();
    }
  });

  it('finds documents by title', async () => {
    const result = await service.search(projectId, 'Architecture');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const docResults = result.data.filter((r) => r.entityType === 'document');
      expect(docResults.length).toBe(1);
      expect(docResults[0].title).toBe('Architecture Overview');
      expect(docResults[0].matchedField).toBe('title');
    }
  });

  it('finds plan items by description body', async () => {
    const result = await service.search(projectId, 'timeout');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const matched = result.data.filter((r) => r.id === 'item-3');
      expect(matched.length).toBe(1);
    }
  });

  it('does not return non-searchable entity types even if they exist in search index', async () => {
    db.prepare(`
      INSERT INTO global_search_index (
        entity_type, entity_id, project_id, title, body, updated_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run('chat_message', 'msg-1', projectId, 'How do I fix auth?', 'How do I fix authentication bug quickly?');

    const row = db.prepare(`
      SELECT id, title, body FROM global_search_index
      WHERE entity_type = ? AND entity_id = ?
    `).get('chat_message', 'msg-1') as { id: number; title: string; body: string | null };

    db.prepare('INSERT INTO global_search_fts(rowid, title, body) VALUES (?, ?, ?)')
      .run(row.id, row.title, row.body ?? '');

    const result = await service.search(projectId, 'authentication');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.map((r) => r.id)).not.toContain('msg-1');
    }
  });

  it('searches across multiple entity types', async () => {
    const result = await service.search(projectId, 'authentication');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const types = new Set(result.data.map((r) => r.entityType));
      expect(types.size).toBeGreaterThanOrEqual(2);
      expect(types.has('plan_item')).toBe(true);
    }
  });

  it('respects project scope', async () => {
    const otherProjectId = 'proj-other';
    db.prepare('INSERT INTO projects (id, name, folder_path) VALUES (?, ?, ?)').run(otherProjectId, 'Other', '/tmp');
    insertSearchIndexRow(db, {
      entityType: 'plan_item',
      entityId: 'item-other',
      projectId: otherProjectId,
      title: 'Authentication in other project',
      body: 'Should not appear',
      statusCategory: 'in_progress',
    });

    const result = await service.search(projectId, 'Authentication');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ids = result.data.map((r) => r.id);
      expect(ids).not.toContain('item-other');
    }
  });

  it('respects limit', async () => {
    const result = await service.search(projectId, 'authentication', 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.length).toBeLessThanOrEqual(1);
    }
  });

  it('orders by relevance ahead of entity type priority', async () => {
    insertSearchIndexRow(db, {
      entityType: 'plan_item',
      entityId: 'item-auth-title',
      projectId,
      title: 'Authentication migration plan',
      body: 'General rollout steps',
      statusCategory: 'in_progress',
    });
    insertSearchIndexRow(db, {
      entityType: 'document',
      projectId,
      title: 'Operations runbook',
      body: 'Troubleshooting authentication and token refresh issues',
    });

    const result = await service.search(projectId, 'authentication');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const titleMatchIndex = result.data.findIndex((r) => r.id === 'item-auth-title');
      expect(titleMatchIndex).toBeGreaterThanOrEqual(0);
      expect(bodyOnlyDocIndex).toBeGreaterThanOrEqual(0);
      expect(titleMatchIndex).toBeLessThan(bodyOnlyDocIndex);
    }
  });

  it('handles punctuation in queries', async () => {
    insertSearchIndexRow(db, {
      entityType: 'plan_item',
      entityId: 'item-special',
      projectId,
      title: 'Item with 100% completion',
      body: '100 completion',
      statusCategory: 'done',
    });

    const result = await service.search(projectId, '100%');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const match = result.data.find((r) => r.id === 'item-special');
      expect(match).toBeTruthy();
    }
  });
});
