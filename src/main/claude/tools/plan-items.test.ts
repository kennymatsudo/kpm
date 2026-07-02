/**
 * Tests for resolveBulkTargetIds — the id-resolution helper shared by the
 * bulk_update_status / bulk_delete / bulk_set_label / bulk_set_release tools.
 */

import { describe, it, expect } from 'vitest';
import BetterSqlite3, { type Database } from 'better-sqlite3';
import { resolveBulkTargetIds } from './plan-items';

function setupSchema(db: Database): void {
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE plan_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      parent_id TEXT,
      title TEXT NOT NULL,
      label TEXT,
      item_order INTEGER NOT NULL,
      status_category TEXT
    );
  `);
  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('project-1', 'Project One');
}

function insertItem(
  db: Database,
  item: { id: string; projectId?: string; parentId?: string | null; label?: string | null; statusCategory?: string | null }
): void {
  db.prepare(
    `INSERT INTO plan_items (id, project_id, parent_id, title, label, item_order, status_category)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    item.id,
    item.projectId ?? 'project-1',
    item.parentId ?? null,
    `Item ${item.id}`,
    item.label ?? null,
    0,
    item.statusCategory ?? null
  );
}

describe('resolveBulkTargetIds', () => {
  it('returns itemIds directly when provided, ignoring filter', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      setupSchema(db);
      insertItem(db, { id: 'a' });
      insertItem(db, { id: 'b' });

      const result = resolveBulkTargetIds(db, 'project-1', ['a', 'b'], { label: 'task' });
      expect(result).toEqual(['a', 'b']);
    } finally {
      db.close();
    }
  });

  it('returns null when neither itemIds nor filter is provided', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      setupSchema(db);
      const result = resolveBulkTargetIds(db, 'project-1', undefined, undefined);
      expect(result).toBeNull();
    } finally {
      db.close();
    }
  });

  it('resolves ids by a single filter field (label)', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      setupSchema(db);
      insertItem(db, { id: 'a', label: 'task' });
      insertItem(db, { id: 'b', label: 'feature' });
      insertItem(db, { id: 'c', label: 'task' });

      const result = resolveBulkTargetIds(db, 'project-1', undefined, { label: 'task' });
      expect(result).toEqual(['a', 'c']);
    } finally {
      db.close();
    }
  });

  it('combines multiple filter fields with AND', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      setupSchema(db);
      insertItem(db, { id: 'a', parentId: 'root-1', statusCategory: 'in_progress', label: 'task' });
      insertItem(db, { id: 'b', parentId: 'root-1', statusCategory: 'done', label: 'task' });
      insertItem(db, { id: 'c', parentId: 'root-2', statusCategory: 'in_progress', label: 'task' });

      const result = resolveBulkTargetIds(db, 'project-1', undefined, {
        parentId: 'root-1',
        statusCategory: 'in_progress',
      });
      expect(result).toEqual(['a']);
    } finally {
      db.close();
    }
  });

  it('scopes the filter query to the given project', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      setupSchema(db);
      db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('project-2', 'Project Two');
      insertItem(db, { id: 'a', projectId: 'project-1', label: 'task' });
      insertItem(db, { id: 'b', projectId: 'project-2', label: 'task' });

      const result = resolveBulkTargetIds(db, 'project-1', undefined, { label: 'task' });
      expect(result).toEqual(['a']);
    } finally {
      db.close();
    }
  });

  it('returns an empty array when the filter matches nothing', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      setupSchema(db);
      insertItem(db, { id: 'a', label: 'task' });

      const result = resolveBulkTargetIds(db, 'project-1', undefined, { label: 'feature' });
      expect(result).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('treats an empty itemIds array as absent and falls back to the filter', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      setupSchema(db);
      insertItem(db, { id: 'a', label: 'task' });

      const result = resolveBulkTargetIds(db, 'project-1', [], { label: 'task' });
      expect(result).toEqual(['a']);
    } finally {
      db.close();
    }
  });
});
