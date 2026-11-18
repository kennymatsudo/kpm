import { describe, expect, it, vi } from 'vitest';
import type { TurnChanges, TurnFileChange } from '../../../shared/diffReview';
import type { ITurnSnapshotRepository, TurnSnapshotRow } from '../../db/interfaces';
import { createTurnSnapshotService } from './TurnSnapshotService';

class FakeRepo implements ITurnSnapshotRepository {
  rows: TurnSnapshotRow[] = [];
  insertBefore(row: Parameters<ITurnSnapshotRepository['insertBefore']>[0]): void {
    this.rows.push({ ...row, afterTree: null, files: null, error: null, createdAt: `t${this.rows.length}` });
  }
  finish(id: string, afterTree: string, files: TurnFileChange[]): void {
    const row = this.rows.find((r) => r.id === id)!;
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

function setup(opts: { roots?: string[]; snapshots?: Record<string, string[]>; patch?: string } = {}) {
  const roots = opts.roots ?? ['/r1'];
  const calls: string[] = [];
  const queues = new Map(Object.entries(opts.snapshots ?? {}).map(([k, v]) => [k, [...v]]));
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
    headTree: vi.fn(async () => 'head'),
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

  it('listTurnChanges skips open turns and empty turns', async () => {
    const { service } = setup({ snapshots: { '/r1': ['b1', 'a1', 'b2'] } });
    await service.beginTurn(turn);
    await service.endTurn('s', { clientMessageId: 'm2' });
    const result = service.listTurnChanges('s');
    expect(result.ok && result.data.map((t) => t.clientMessageId)).toEqual(['m1']);
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

  it('getDiff passes the file filter as paths', async () => {
    const { service, git } = setup({ snapshots: { '/r1': ['b', 'a'] } });
    await service.beginTurn(turn);
    await service.endTurn('s');
    await service.getDiff({
      projectId: 'p',
      chatSessionId: 's',
      scope: 'turn',
      clientMessageId: 'm1',
      rootPath: '/r1',
      filePath: 'a.ts',
    });
    expect(git.diffTrees).toHaveBeenLastCalledWith(
      expect.anything(),
      'b',
      'a',
      expect.objectContaining({ paths: ['a.ts'] }),
    );
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
});
