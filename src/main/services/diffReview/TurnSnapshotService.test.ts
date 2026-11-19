import { describe, expect, it, vi } from 'vitest';
import type { TurnChanges, TurnFileChange } from '../../../shared/diffReview';
import type { ITurnSnapshotRepository, TurnSnapshotRow } from '../../db/interfaces';
import { parseUnifiedDiff } from '../../../shared/unifiedDiff';
import { createTurnSnapshotService } from './TurnSnapshotService';

class FakeRepo implements ITurnSnapshotRepository {
  rows: TurnSnapshotRow[] = [];
  insertBefore(row: Parameters<ITurnSnapshotRepository['insertBefore']>[0]): void {
    this.rows.push({ ...row, afterTree: null, files: null, error: null, incomplete: false, createdAt: `t${this.rows.length}` });
  }
  finish(id: string, afterTree: string, files: TurnFileChange[], incomplete = false): void {
    const row = this.rows.find((r) => r.id === id)!;
    row.incomplete = incomplete;
    row.afterTree = afterTree;
    row.files = files;
  }
  fail(id: string, error: string): void {
    this.rows.find((r) => r.id === id)!.error = error;
  }
  delete(id: string): void {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
  listBySession(chatSessionId: string): TurnSnapshotRow[] {
    return this.rows.filter((r) => r.chatSessionId === chatSessionId);
  }
  listByTurn(chatSessionId: string, clientMessageId: string): TurnSnapshotRow[] {
    return this.rows.filter((r) => r.chatSessionId === chatSessionId && r.clientMessageId === clientMessageId);
  }
}

const PATCH = (file: string): string =>
  [
    `diff --git a/${file} b/${file}`,
    'index 111..222 100644',
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -1,1 +1,2 @@',
    ' keep',
    '+added',
    '',
  ].join('\n');

interface SetupOptions {
  roots?: string[];
  snapshots?: Record<string, string[]>;
  patch?: string;
  /** HEAD commits returned per root, in call order; the last one repeats. */
  heads?: Record<string, (string | null)[]>;
  /** Paths changed between two tree-ish values, keyed `from..to`. */
  changed?: Record<string, string[]>;
  commitFiles?: string[];
}

function setup(opts: SetupOptions = {}) {
  const roots = opts.roots ?? ['/r1'];
  const calls: string[] = [];
  const queues = new Map(Object.entries(opts.snapshots ?? {}).map(([k, v]) => [k, [...v]]));
  const heads = new Map(Object.entries(opts.heads ?? {}).map(([k, v]) => [k, [...v]]));
  let n = 0;
  const git = {
    snapshotRoot: vi.fn(async (rootPath: string) => {
      calls.push(rootPath);
      const q = queues.get(rootPath);
      const next = q ? q.shift() : `tree${n++}`;
      if (next === undefined || next === 'FAIL') throw new Error('snapshot boom');
      return { rootPath, store: 'repo' as const, tree: next };
    }),
    diffTrees: vi.fn(async (_s: unknown, from: string, to: string) => (from === to ? '' : (opts.patch ?? PATCH('a.ts')))),
    diffStats: vi.fn(async (s: { rootPath: string }, from: string, to: string) =>
      from === to
        ? []
        : parseUnifiedDiff(opts.patch ?? PATCH('a.ts'), s.rootPath).map(({ hunks: _hunks, ...file }) => file),
    ),
    headTree: vi.fn(async () => 'head'),
    headCommit: vi.fn(async (rootPath: string) => {
      const q = heads.get(rootPath);
      if (!q) return 'h0';
      return q.length > 1 ? q.shift()! : q[0];
    }),
    changedPaths: vi.fn(async (_s: unknown, from: string, to: string) => new Set(opts.changed?.[`${from}..${to}`] ?? [])),
    filesInCommitsSince: vi.fn(async () => new Set(opts.commitFiles ?? [])),
  };
  const repo = new FakeRepo();
  const emitted: TurnChanges[] = [];
  const service = createTurnSnapshotService({
    snapshots: repo,
    resolveRoots: () => roots,
    shadowDir: '/shadow',
    emitTurnChanges: (_p, c) => emitted.push(c),
    git,
  });
  return { service, repo, git, emitted, calls };
}

const turn = { projectId: 'p', chatSessionId: 's', clientMessageId: 'm1' };

describe('TurnSnapshotService', () => {
  it('finishes the row and emits changes when a file changed', async () => {
    const { service, repo, emitted } = setup({ snapshots: { '/r1': ['before', 'after'] } });
    await service.beginTurn(turn);
    await service.endTurn('s');
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0].afterTree).toBe('after');
    expect(repo.rows[0].files?.map((f) => f.path)).toEqual(['a.ts']);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ chatSessionId: 's', clientMessageId: 'm1' });
    expect(emitted[0].files.map((f) => f.path)).toEqual(['a.ts']);
  });

  it('marks a turn incomplete when the send stopped waiting for the before snapshot', async () => {
    const { service, repo, emitted } = setup({ snapshots: { '/r1': ['before', 'after'] } });
    await service.beginTurn(turn);
    service.markLate('s', 'm1');
    await service.endTurn('s');
    expect(emitted[0].incomplete).toBe(true);
    expect(repo.rows[0].incomplete).toBe(true);
    expect(service.listTurnChanges('s')).toMatchObject({ ok: true, data: [{ clientMessageId: 'm1', incomplete: true }] });
  });

  it('leaves incomplete unset for a turn that was not late', async () => {
    const { service, emitted } = setup({ snapshots: { '/r1': ['before', 'after'] } });
    await service.beginTurn(turn);
    await service.endTurn('s');
    expect(emitted[0].incomplete).toBeUndefined();
  });

  it('counts files with diffStats, not a full-context patch', async () => {
    const { service, git } = setup({ snapshots: { '/r1': ['before', 'after'] } });
    await service.beginTurn(turn);
    await service.endTurn('s');
    expect(git.diffStats).toHaveBeenCalledWith(expect.anything(), 'before', 'after', expect.anything());
    expect(git.diffTrees).not.toHaveBeenCalled();
  });

  it('isKnownRoot accepts only the project roots', () => {
    const { service } = setup({ roots: ['/r1', '/r2'] });
    expect(service.isKnownRoot('p', '/r2')).toBe(true);
    expect(service.isKnownRoot('p', '/etc')).toBe(false);
  });

  it('deletes the row and emits nothing when nothing changed', async () => {
    const { service, repo, emitted } = setup({ snapshots: { '/r1': ['same', 'same'] } });
    await service.beginTurn(turn);
    await service.endTurn('s');
    expect(repo.rows).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });

  it('does nothing when ending without an open turn', async () => {
    const { service, git } = setup();
    await service.endTurn('s');
    expect(git.snapshotRoot).not.toHaveBeenCalled();
  });

  it('opens the next turn from the previous after tree without a new snapshot', async () => {
    const { service, repo, git } = setup({ snapshots: { '/r1': ['b', 'a'] } });
    await service.beginTurn(turn);
    await service.endTurn('s', { clientMessageId: 'm2' });
    expect(git.snapshotRoot).toHaveBeenCalledTimes(2);
    const next = repo.rows.find((r) => r.clientMessageId === 'm2')!;
    expect(next.beforeTree).toBe('a');
    expect(next.afterTree).toBeNull();
  });

  it('skips a root that fails at begin and records the others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { service, repo } = setup({ roots: ['/bad', '/ok'], snapshots: { '/bad': ['FAIL'], '/ok': ['x'] } });
    await service.beginTurn(turn);
    expect(repo.rows.map((r) => r.rootPath)).toEqual(['/ok']);
    warn.mockRestore();
  });

  it('records a failed end snapshot and emits an unavailable reason', async () => {
    const { service, repo, emitted } = setup({ snapshots: { '/r1': ['b', 'FAIL'] } });
    await service.beginTurn(turn);
    await service.endTurn('s');
    expect(repo.rows[0].error).toBe('snapshot boom');
    expect(emitted[0].files).toEqual([]);
    expect(emitted[0].unavailableReason).toBe('snapshot boom');
  });

  it('serializes snapshots for the same root across sessions', async () => {
    let active = 0;
    let overlap = false;
    const { service, git } = setup();
    git.snapshotRoot.mockImplementation(async (rootPath: string) => {
      active++;
      if (active > 1) overlap = true;
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return { rootPath, store: 'repo' as const, tree: 't' };
    });
    await Promise.all([
      service.beginTurn({ ...turn, chatSessionId: 's1' }),
      service.beginTurn({ ...turn, chatSessionId: 's2' }),
    ]);
    expect(overlap).toBe(false);
  });

  it('listTurnChanges skips open turns', async () => {
    const { service } = setup({ snapshots: { '/r1': ['b1', 'a1', 'b2'] } });
    await service.beginTurn(turn);
    await service.endTurn('s', { clientMessageId: 'm2' });
    const result = service.listTurnChanges('s');
    expect(result.ok && result.data.map((t) => t.clientMessageId)).toEqual(['m1']);
  });

  it('listTurnChanges skips a finished turn with zero files', async () => {
    const { service, repo } = setup({ snapshots: { '/r1': ['b', 'a'] } });
    await service.beginTurn(turn);
    await service.endTurn('s');
    repo.finish(repo.rows[0].id, 'a', []);
    const result = service.listTurnChanges('s');
    expect(result).toEqual({ ok: true, data: [] });
  });

  it('beginTurn while a turn is open ends it first', async () => {
    const { service, repo } = setup({ snapshots: { '/r1': ['b1', 'a1', 'b2'] } });
    const finish = vi.spyOn(repo, 'finish');
    await service.beginTurn(turn);
    await service.beginTurn({ ...turn, clientMessageId: 'm2' });
    expect(finish).toHaveBeenCalledTimes(1);
    expect(repo.rows.map((r) => [r.clientMessageId, r.beforeTree])).toEqual([
      ['m1', 'b1'],
      ['m2', 'b2'],
    ]);
  });

  it('a second endTurn is a no-op', async () => {
    const { service, git, emitted } = setup({ snapshots: { '/r1': ['b', 'a'] } });
    await service.beginTurn(turn);
    await service.endTurn('s');
    await service.endTurn('s');
    expect(git.snapshotRoot).toHaveBeenCalledTimes(2);
    expect(emitted).toHaveLength(1);
  });

  it('a rejected end step does not block later calls for the session', async () => {
    const { service, repo } = setup({ snapshots: { '/r1': ['b1', 'FAIL', 'b2', 'a2'] } });
    await service.beginTurn(turn);
    await service.endTurn('s');
    await service.beginTurn({ ...turn, clientMessageId: 'm2' });
    await service.endTurn('s');
    expect(repo.rows.find((r) => r.clientMessageId === 'm2')?.afterTree).toBe('a2');
  });

  it('opens the next turn from the after tree when diffing fails', async () => {
    const { service, repo, git, emitted } = setup({ snapshots: { '/r1': ['b', 'a'] } });
    await service.beginTurn(turn);
    git.diffStats.mockRejectedValueOnce(new Error('diff boom'));
    await service.endTurn('s', { clientMessageId: 'm2' });
    expect(repo.rows.find((r) => r.clientMessageId === 'm1')?.error).toBe('diff boom');
    expect(repo.rows.find((r) => r.clientMessageId === 'm2')?.beforeTree).toBe('a');
    expect(emitted[0].unavailableReason).toBe('diff boom');
  });

  it('keeps going when recording a failure throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { service, repo, git, emitted } = setup({
      roots: ['/bad', '/ok'],
      snapshots: { '/bad': ['b', 'FAIL'], '/ok': ['b', 'a'] },
    });
    vi.spyOn(repo, 'fail').mockImplementation(() => {
      throw new Error('db down');
    });
    await service.beginTurn(turn);
    await expect(service.endTurn('s', { clientMessageId: 'm2' })).resolves.toBeUndefined();
    expect(git.snapshotRoot).toHaveBeenCalled();
    expect(emitted).toHaveLength(1);
    expect(emitted[0].files.map((f) => f.path)).toEqual(['a.ts']);
    expect(repo.rows.some((r) => r.clientMessageId === 'm2' && r.rootPath === '/ok')).toBe(true);
    warn.mockRestore();
  });

  it('getDiff chat scope diffs the first before to the last after', async () => {
    const { service, git } = setup({ snapshots: { '/r1': ['b1', 'a1', 'a2'] } });
    await service.beginTurn(turn);
    await service.endTurn('s', { clientMessageId: 'm2' });
    await service.endTurn('s');
    const result = await service.getDiff({ projectId: 'p', chatSessionId: 's', scope: 'chat' });
    expect(git.diffTrees).toHaveBeenLastCalledWith(expect.anything(), 'b1', 'a2', expect.anything());
    expect(result.ok && result.data.map((d) => d.path)).toEqual(['a.ts']);
  });

  it('getDiff filters by file after diffing so a rename keeps its old path', async () => {
    const rename = [
      'diff --git a/old.ts b/new.ts',
      'similarity index 90%',
      'rename from old.ts',
      'rename to new.ts',
      'index 111..222 100644',
      '--- a/old.ts',
      '+++ b/new.ts',
      '@@ -1,1 +1,2 @@',
      ' keep',
      '+added',
      '',
    ].join('\n') + PATCH('other.ts');
    const { service, git } = setup({ snapshots: { '/r1': ['b', 'a'] }, patch: rename });
    await service.beginTurn(turn);
    await service.endTurn('s');
    const input = { projectId: 'p', chatSessionId: 's', scope: 'turn' as const, clientMessageId: 'm1', rootPath: '/r1' };
    for (const filePath of ['new.ts', 'old.ts']) {
      const result = await service.getDiff({ ...input, filePath });
      expect(result.ok && result.data.map((d) => [d.path, d.oldPath, d.status])).toEqual([['new.ts', 'old.ts', 'renamed']]);
    }
    expect(git.diffTrees).toHaveBeenLastCalledWith(expect.anything(), 'b', 'a', expect.not.objectContaining({ paths: expect.anything() }));
  });

  it('getDiff uncommitted diffs HEAD to a fresh snapshot', async () => {
    const { service, git } = setup({ snapshots: { '/r1': ['now'] } });
    const result = await service.getDiff({ projectId: 'p', chatSessionId: 's', scope: 'uncommitted' });
    expect(git.diffTrees).toHaveBeenCalledWith(expect.anything(), 'head', 'now', expect.anything());
    expect(result.ok).toBe(true);
  });

  it('getDiff maps a bad object error to Snapshot expired', async () => {
    const { service, git } = setup({ snapshots: { '/r1': ['b', 'a'] } });
    await service.beginTurn(turn);
    await service.endTurn('s');
    git.diffTrees.mockRejectedValueOnce(new Error('fatal: bad object abc'));
    const result = await service.getDiff({ projectId: 'p', chatSessionId: 's', scope: 'turn', clientMessageId: 'm1' });
    expect(result).toEqual({ ok: false, error: 'Snapshot expired' });
  });

  it('getDiff returns other git errors verbatim', async () => {
    const { service, git } = setup({ snapshots: { '/r1': ['b', 'a'] } });
    await service.beginTurn(turn);
    await service.endTurn('s');
    git.diffTrees.mockRejectedValueOnce(new Error('kaput'));
    const result = await service.getDiff({ projectId: 'p', chatSessionId: 's', scope: 'turn', clientMessageId: 'm1' });
    expect(result).toEqual({ ok: false, error: 'kaput' });
  });

  describe('HEAD moves', () => {
    const moved = { heads: { '/r1': ['h1', 'h2'] }, snapshots: { '/r1': ['b', 'a'] } };

    it('makes no extra git calls when HEAD did not move', async () => {
      const { service, git, emitted } = setup({ snapshots: { '/r1': ['b', 'a'] } });
      await service.beginTurn(turn);
      await service.endTurn('s');
      expect(git.changedPaths).not.toHaveBeenCalled();
      expect(git.filesInCommitsSince).not.toHaveBeenCalled();
      expect(emitted[0].files.map((f) => f.path)).toEqual(['a.ts']);
    });

    it('drops files that only the HEAD move changed', async () => {
      const { service, git, repo, emitted } = setup({ ...moved, changed: { 'h1..h2': ['a.ts'] } });
      await service.beginTurn(turn);
      await service.endTurn('s');
      expect(git.filesInCommitsSince).toHaveBeenCalledWith('/r1', 'h1', 'h2', expect.any(Number), expect.anything());
      expect(emitted).toHaveLength(0);
      expect(repo.rows).toHaveLength(0);
    });

    it('keeps a moved file the agent committed during the turn', async () => {
      const { service, emitted } = setup({ ...moved, changed: { 'h1..h2': ['a.ts'] }, commitFiles: ['a.ts'] });
      await service.beginTurn(turn);
      await service.endTurn('s');
      expect(emitted[0].files.map((f) => f.path)).toEqual(['a.ts']);
    });

    it('keeps a moved file that was dirty before or after', async () => {
      const dirtyBefore = setup({ ...moved, changed: { 'h1..h2': ['a.ts'], 'h1..b': ['a.ts'] } });
      await dirtyBefore.service.beginTurn(turn);
      await dirtyBefore.service.endTurn('s');
      expect(dirtyBefore.emitted[0].files).toHaveLength(1);
      const dirtyAfter = setup({ ...moved, changed: { 'h1..h2': ['a.ts'], 'h2..a': ['a.ts'] } });
      await dirtyAfter.service.beginTurn(turn);
      await dirtyAfter.service.endTurn('s');
      expect(dirtyAfter.emitted[0].files).toHaveLength(1);
    });

    it('opens the next turn from the after HEAD commit', async () => {
      const { service, git } = setup({ heads: { '/r1': ['h1', 'h2', 'h3'] }, snapshots: { '/r1': ['b', 'a', 'a2'] } });
      await service.beginTurn(turn);
      await service.endTurn('s', { clientMessageId: 'm2' });
      await service.endTurn('s');
      expect(git.filesInCommitsSince).toHaveBeenLastCalledWith('/r1', 'h2', 'h3', expect.any(Number), expect.anything());
    });

    it('keeps every file when the HEAD lookup fails', async () => {
      const { service, git, emitted } = setup({ snapshots: { '/r1': ['b', 'a'] } });
      git.headCommit.mockResolvedValueOnce('h1').mockRejectedValueOnce(new Error('boom'));
      await service.beginTurn(turn);
      await service.endTurn('s');
      expect(emitted[0].files).toHaveLength(1);
    });
  });

  describe('getDiff only lists files in the stored turns', () => {
    const two = (paths: string[]) =>
      paths.flatMap((p) => PATCH(p).split('diff --git').filter(Boolean).map((x) => `diff --git${x}`)).join('');

    it('turn scope drops files the stored list left out', async () => {
      const { service, repo } = setup({ snapshots: { '/r1': ['b', 'a'] }, patch: two(['a.ts', 'pulled.ts']) });
      await service.beginTurn(turn);
      await service.endTurn('s');
      repo.rows[0].files = repo.rows[0].files!.filter((f) => f.path === 'a.ts');
      const result = await service.getDiff({ projectId: 'p', chatSessionId: 's', scope: 'turn', clientMessageId: 'm1' });
      expect(result.ok && result.data.map((d) => d.path)).toEqual(['a.ts']);
    });

    it('chat scope keeps files listed in any stored turn', async () => {
      const { service, repo } = setup({ snapshots: { '/r1': ['b1', 'a1', 'a2'] }, patch: two(['a.ts', 'pulled.ts']) });
      await service.beginTurn(turn);
      await service.endTurn('s', { clientMessageId: 'm2' });
      await service.endTurn('s');
      for (const row of repo.rows) row.files = row.files!.filter((f) => f.path === 'a.ts');
      const result = await service.getDiff({ projectId: 'p', chatSessionId: 's', scope: 'chat' });
      expect(result.ok && result.data.map((d) => d.path)).toEqual(['a.ts']);
    });

    it('uncommitted scope is unfiltered', async () => {
      const { service } = setup({ snapshots: { '/r1': ['now'] }, patch: two(['a.ts', 'pulled.ts']) });
      const result = await service.getDiff({ projectId: 'p', chatSessionId: 's', scope: 'uncommitted' });
      expect(result.ok && result.data.map((d) => d.path)).toEqual(['a.ts', 'pulled.ts']);
    });
  });
});
