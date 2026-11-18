import { describe, expect, it } from 'vitest';
import type { Database } from 'better-sqlite3';
import { createTestDb } from '../../testing/createTestDb';
import { TurnSnapshotRepository } from './TurnSnapshotRepository';
import { DiffReviewCommentRepository } from './DiffReviewCommentRepository';

function seedProject(db: Database, id: string): void {
  db.prepare('INSERT INTO projects (id, name, folder_path) VALUES (?, ?, ?)').run(id, 'Test project', `/tmp/${id}`);
}

describe('TurnSnapshotRepository', () => {
  it('records a turn from before to finished with files', () => {
    const db = createTestDb();
    try {
      seedProject(db, 'p1');
      const repo = new TurnSnapshotRepository(db);
      repo.insertBefore({ id: 's1', projectId: 'p1', chatSessionId: 'c1', clientMessageId: 'm1', rootPath: '/r', store: 'repo', beforeTree: 'aaa' });
      repo.finish('s1', 'bbb', [{ rootPath: '/r', path: 'a.ts', status: 'modified', additions: 1, deletions: 0 }]);
      const [row] = repo.listByTurn('c1', 'm1');
      expect(row).toMatchObject({ beforeTree: 'aaa', afterTree: 'bbb', error: null });
      expect(row.files?.[0].path).toBe('a.ts');
      expect(repo.listBySession('c1')).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it('stores the incomplete flag on finish and clears it on retry', () => {
    const db = createTestDb();
    try {
      seedProject(db, 'p1');
      const repo = new TurnSnapshotRepository(db);
      const before = { projectId: 'p1', chatSessionId: 'c1', clientMessageId: 'm1', rootPath: '/r', store: 'repo' as const };
      repo.insertBefore({ ...before, id: 's1', beforeTree: 'aaa' });
      expect(repo.listByTurn('c1', 'm1')[0].incomplete).toBe(false);
      repo.finish('s1', 'bbb', [], true);
      expect(repo.listByTurn('c1', 'm1')[0].incomplete).toBe(true);
      repo.insertBefore({ ...before, id: 's2', beforeTree: 'ccc' });
      expect(repo.listByTurn('c1', 'm1')[0].incomplete).toBe(false);
    } finally {
      db.close();
    }
  });

  it('resets a retried turn, records failures, and deletes', () => {
    const db = createTestDb();
    try {
      seedProject(db, 'p1');
      const repo = new TurnSnapshotRepository(db);
      const before = { projectId: 'p1', chatSessionId: 'c1', clientMessageId: 'm1', rootPath: '/r', store: 'shadow' as const };
      repo.insertBefore({ ...before, id: 's1', beforeTree: 'aaa' });
      repo.finish('s1', 'bbb', []);
      repo.insertBefore({ ...before, id: 's2', beforeTree: 'ccc' });
      const rows = repo.listByTurn('c1', 'm1');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: 's2', beforeTree: 'ccc', afterTree: null, files: null });
      repo.fail('s2', 'boom');
      expect(repo.listByTurn('c1', 'm1')[0].error).toBe('boom');
      repo.delete('s2');
      expect(repo.listBySession('c1')).toEqual([]);
    } finally {
      db.close();
    }
  });
});

describe('DiffReviewCommentRepository', () => {
  it('creates, updates, lists by session, and deletes many', () => {
    const db = createTestDb();
    try {
      seedProject(db, 'p1');
      const repo = new DiffReviewCommentRepository(db);
      const base = { projectId: 'p1', rootPath: '/r', filePath: 'a.md', side: 'new' as const, startLine: 3, endLine: 4, quotedText: 'x\ny', body: 'fix' };
      repo.create({ ...base, id: 'k1', chatSessionId: 'c1' });
      repo.create({ ...base, id: 'k2', chatSessionId: 'c1' });
      repo.create({ ...base, id: 'k3', chatSessionId: 'c2' });
      expect(repo.update('k1', { body: 'changed', startLine: 5, endLine: 6 })).toMatchObject({ body: 'changed', startLine: 5, endLine: 6, quotedText: 'x\ny' });
      expect(repo.update('missing', { body: 'x' })).toBeUndefined();
      expect(repo.listBySession('c1').map((c) => c.id)).toEqual(['k1', 'k2']);
      expect(repo.getMany(['k2', 'k3']).map((c) => c.id).sort()).toEqual(['k2', 'k3']);
      repo.deleteMany(['k1', 'k2']);
      expect(repo.listBySession('c1')).toEqual([]);
      repo.delete('k3');
      expect(repo.getMany(['k3'])).toEqual([]);
    } finally {
      db.close();
    }
  });
});
