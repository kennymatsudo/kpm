import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from 'better-sqlite3';
import { createTestDatabase } from '../mocks/database';
import { getConfig } from '../../src/main/config';

type WatchCallback = (err: Error | null, events: { path: string; type: string }[]) => void;

const watcherMock = vi.hoisted(() => ({
  callbacks: new Map<string, (err: Error | null, events: { path: string; type: string }[]) => void>(),
  subscribe: vi.fn(),
}));

vi.mock('@parcel/watcher', () => ({ subscribe: watcherMock.subscribe }));

import { buildFtsMatchQuery, createSearchService, type SearchService } from '../../src/main/services/core/SearchService';

function indexedDocumentIds(db: Database, projectId: string): string[] {
  return (db.prepare(`
    SELECT entity_id FROM global_search_index
    WHERE project_id = ? AND entity_type = 'document'
    ORDER BY entity_id
  `).all(projectId) as { entity_id: string }[]).map((row) => row.entity_id);
}

/** Waits past the sync debounce (a real timer; only intervals are faked). */
async function waitPastSyncDebounce(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, getConfig().watcher.searchDocSyncDebounceMs + 300));
}

describe('SearchService background indexing', () => {
  let db: Database;
  let tmpRoot: string;
  let projectFolder: string;
  let service: SearchService;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    watcherMock.callbacks.clear();
    watcherMock.subscribe.mockReset();
    watcherMock.subscribe.mockImplementation(async (folder: string, callback: WatchCallback) => {
      watcherMock.callbacks.set(folder, callback);
      return { unsubscribe: vi.fn().mockResolvedValue(undefined) };
    });

    db = createTestDatabase();
    // The sql.js test build has no FTS5, so the search migration is skipped.
    // Background indexing only writes the index table; the FTS table just
    // needs to exist for the readiness check.
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
        UNIQUE(project_id, entity_type, entity_id)
      );
      CREATE TABLE global_search_fts (title TEXT, body TEXT);
    `);
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kpm-search-'));
    projectFolder = path.join(tmpRoot, 'project');
    db.prepare('INSERT INTO projects (id, name, folder_path) VALUES (?, ?, ?)').run('p1', 'P1', projectFolder);
    service = createSearchService({ getDatabase: () => db });
  });

  afterEach(async () => {
    await service.disposeBackgroundIndexing();
    vi.useRealTimers();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    db.close();
  });

  it('does not retry watching a missing folder, and drops its stale results once', async () => {
    db.prepare(`
      INSERT INTO global_search_index (entity_type, entity_id, project_id, title, body, updated_at)
      VALUES ('document', 'old.md', 'p1', 'old', 'old', '2026-01-01T00:00:00.000Z')
    `).run();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    service.startBackgroundIndexing();
    await vi.advanceTimersByTimeAsync(getConfig().watcher.searchReconcileIntervalMs * 3);
    await vi.waitFor(() => expect(indexedDocumentIds(db, 'p1')).toEqual([]));

    expect(watcherMock.subscribe).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('starts watching and indexing once a missing folder appears', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    service.startBackgroundIndexing();
    expect(watcherMock.subscribe).not.toHaveBeenCalled();

    fs.mkdirSync(projectFolder, { recursive: true });
    fs.writeFileSync(path.join(projectFolder, 'notes.md'), '# Notes');
    await vi.advanceTimersByTimeAsync(getConfig().watcher.searchReconcileIntervalMs);

    expect(watcherMock.subscribe).toHaveBeenCalledWith(projectFolder, expect.any(Function), expect.anything());
    await vi.waitFor(() => expect(indexedDocumentIds(db, 'p1')).toEqual(['notes.md']));
  });

  it('ignores changes inside folders the index skips', async () => {
    fs.mkdirSync(path.join(projectFolder, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(projectFolder, 'a.md'), 'a');
    service.startBackgroundIndexing();
    await vi.waitFor(() => expect(indexedDocumentIds(db, 'p1')).toEqual(['a.md']));
    await vi.waitFor(() => expect(watcherMock.callbacks.has(projectFolder)).toBe(true));
    const emit = watcherMock.callbacks.get(projectFolder)!;

    // b.md is only picked up if some event triggers a sync.
    fs.writeFileSync(path.join(projectFolder, 'b.md'), 'b');
    emit(null, [{ path: path.join(projectFolder, '.claude', 'plan.md'), type: 'update' }]);
    await waitPastSyncDebounce();
    expect(indexedDocumentIds(db, 'p1')).toEqual(['a.md']);

    emit(null, [{ path: path.join(projectFolder, 'b.md'), type: 'create' }]);
    await vi.waitFor(() => expect(indexedDocumentIds(db, 'p1')).toEqual(['a.md', 'b.md']));
  });
});

describe('buildFtsMatchQuery', () => {
  it('quotes each token so hyphens and operator words stay plain text', () => {
    expect(buildFtsMatchQuery('data-race NOT fix')).toBe('"data-race"* AND "NOT"* AND "fix"*');
  });

  it('strips characters that would break out of the phrase', () => {
    expect(buildFtsMatchQuery('"race" col:x')).toBe('"race"* AND "colx"*');
    expect(buildFtsMatchQuery('"" :')).toBeNull();
  });
});
