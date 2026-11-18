import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { diffStats, diffTrees, headTree, snapshotRoot } from './gitSnapshot';
import { parseUnifiedDiff } from '../../../shared/unifiedDiff';

const dirs: string[] = [];
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpm-snap-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function initRepo(): string {
  const dir = tempDir();
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir });
  git('init', '-q');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'one\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'ignored.txt\n');
  git('add', '.');
  git('commit', '-qm', 'init');
  return dir;
}

function gitOut(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd }).toString();
}

describe('snapshotRoot in a git repo', () => {
  it('captures modified and untracked files, skips ignored ones, and leaves the index alone', async () => {
    const repo = initRepo();
    const options = { shadowDir: tempDir(), timeoutMs: 10_000 };
    const before = await snapshotRoot(repo, options);
    expect(before.store).toBe('repo');

    fs.writeFileSync(path.join(repo, 'a.txt'), 'two\n');
    fs.writeFileSync(path.join(repo, 'new.md'), '# hi\n');
    fs.writeFileSync(path.join(repo, 'ignored.txt'), 'x\n');
    const after = await snapshotRoot(repo, options);

    const files = parseUnifiedDiff(await diffTrees(before, before.tree, after.tree, options), repo);
    expect(files.map((f) => [f.path, f.status]).sort()).toEqual([
      ['a.txt', 'modified'],
      ['new.md', 'added'],
    ]);
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: repo }).toString()).toContain('?? new.md');
    expect(execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: repo }).toString()).toBe('');
  });

  it('diffs HEAD against a snapshot', async () => {
    const repo = initRepo();
    const options = { shadowDir: tempDir(), timeoutMs: 10_000 };
    fs.writeFileSync(path.join(repo, 'a.txt'), 'changed\n');
    const now = await snapshotRoot(repo, options);
    const head = await headTree(repo, options);
    const files = parseUnifiedDiff(await diffTrees(now, head!, now.tree, options), repo);
    expect(files.map((f) => f.path)).toEqual(['a.txt']);
  });

  it('removes its temp index after a repo-mode snapshot', async () => {
    const repo = initRepo();
    const options = { shadowDir: tempDir(), timeoutMs: 10_000 };
    const tempIndexes = () => fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('kpm-snapshot-'));
    const before = tempIndexes();
    await snapshotRoot(repo, options);
    expect(tempIndexes()).toEqual(before);
  });

  it('snapshots a linked worktree in repo mode and leaves its index empty', async () => {
    const repo = initRepo();
    const worktree = path.join(tempDir(), 'wt');
    execFileSync('git', ['worktree', 'add', '-q', '-b', 'wt-branch', worktree], { cwd: repo });
    const options = { shadowDir: tempDir(), timeoutMs: 10_000 };
    const before = await snapshotRoot(worktree, options);
    expect(before.store).toBe('repo');

    fs.writeFileSync(path.join(worktree, 'a.txt'), 'two\n');
    const after = await snapshotRoot(worktree, options);

    const files = parseUnifiedDiff(await diffTrees(before, before.tree, after.tree, options), worktree);
    expect(files.map((f) => [f.path, f.status])).toEqual([['a.txt', 'modified']]);
    expect(gitOut(worktree, 'diff', '--cached', '--name-only')).toBe('');
  });
});

describe('snapshotRoot outside git', () => {
  it('uses a shadow store and adds nothing to the folder', async () => {
    const folder = tempDir();
    const options = { shadowDir: tempDir(), timeoutMs: 10_000 };
    fs.writeFileSync(path.join(folder, 'doc.md'), 'a\n');
    const before = await snapshotRoot(folder, options);
    expect(before.store).toBe('shadow');
    fs.writeFileSync(path.join(folder, 'doc.md'), 'b\n');
    const after = await snapshotRoot(folder, options);
    const files = parseUnifiedDiff(await diffTrees(before, before.tree, after.tree, options), folder);
    expect(files.map((f) => f.path)).toEqual(['doc.md']);
    expect(fs.readdirSync(folder)).toEqual(['doc.md']);
  });

  it('a second shadow snapshot picks up a change made after the first', async () => {
    const folder = tempDir();
    const shadowDir = tempDir();
    const options = { shadowDir, timeoutMs: 10_000 };
    fs.writeFileSync(path.join(folder, 'doc.md'), 'aaa\n');
    const first = await snapshotRoot(folder, options);
    // Same size and written right after the first snapshot: only a real re-check of the content sees it.
    fs.writeFileSync(path.join(folder, 'doc.md'), 'bbb\n');
    const second = await snapshotRoot(folder, options);

    expect(second.tree).not.toBe(first.tree);
    const files = parseUnifiedDiff(await diffTrees(second, first.tree, second.tree, options), folder);
    expect(files.map((f) => f.path)).toEqual(['doc.md']);
    const [shadowRepo] = fs.readdirSync(shadowDir);
    expect(fs.existsSync(path.join(shadowDir, shadowRepo, 'kpm-index'))).toBe(true);
  });

  it('snapshots a subdirectory of a git repo in shadow mode and writes nothing to the repo or folder', async () => {
    const repo = initRepo();
    const folder = path.join(repo, 'sub');
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'x.md'), 'a\n');
    gitOut(repo, 'add', 'sub');
    gitOut(repo, 'commit', '-qm', 'sub');

    const options = { shadowDir: tempDir(), timeoutMs: 10_000 };
    const before = await snapshotRoot(folder, options);
    expect(before.store).toBe('shadow');
    fs.writeFileSync(path.join(folder, 'x.md'), 'b\n');
    // Captured after the edit, so the only status difference the snapshot could cause is its own.
    const statusBefore = gitOut(repo, 'status', '--porcelain');
    const after = await snapshotRoot(folder, options);

    const files = parseUnifiedDiff(await diffTrees(before, before.tree, after.tree, options), folder);
    expect(files.map((f) => f.path)).toEqual(['x.md']);
    expect(gitOut(repo, 'status', '--porcelain')).toBe(statusBefore);
    expect(gitOut(repo, 'diff', '--cached', '--name-only')).toBe('');
    expect(fs.readdirSync(folder)).toEqual(['x.md']);
  });
});

describe('diffStats', () => {
  it('reports modified, added, deleted, renamed and binary files without a patch', async () => {
    const repo = initRepo();
    const options = { shadowDir: tempDir(), timeoutMs: 10_000 };
    const write = (name: string, data: string | Buffer) => fs.writeFileSync(path.join(repo, name), data);
    write('mod.txt', 'one\ntwo\n');
    write('gone.txt', 'bye\n');
    write('move.txt', 'a\nb\nc\nd\ne\nf\n');
    write('bin.dat', Buffer.from([0, 1, 2, 3]));
    const before = await snapshotRoot(repo, options);

    write('mod.txt', 'one\nthree\nfour\n');
    write('new.txt', 'n1\nn2\n');
    fs.rmSync(path.join(repo, 'gone.txt'));
    fs.renameSync(path.join(repo, 'move.txt'), path.join(repo, 'moved.txt'));
    write('bin.dat', Buffer.from([0, 9, 8, 7, 6, 0]));
    const after = await snapshotRoot(repo, options);

    const stats = await diffStats(before, before.tree, after.tree, options);
    const byPath = Object.fromEntries(stats.map((f) => [f.path, f]));
    expect(Object.keys(byPath).sort()).toEqual(['bin.dat', 'mod.txt', 'moved.txt', 'new.txt', 'gone.txt'].sort());
    expect(byPath['mod.txt']).toMatchObject({ rootPath: repo, status: 'modified', additions: 2, deletions: 1 });
    expect(byPath['new.txt']).toMatchObject({ status: 'added', additions: 2, deletions: 0 });
    expect(byPath['gone.txt']).toMatchObject({ status: 'deleted', additions: 0, deletions: 1 });
    expect(byPath['moved.txt']).toMatchObject({ status: 'renamed', oldPath: 'move.txt', additions: 0, deletions: 0 });
    expect(byPath['bin.dat']).toMatchObject({ status: 'modified', additions: 0, deletions: 0 });
  });

  it('returns nothing for identical trees', async () => {
    const repo = initRepo();
    const options = { shadowDir: tempDir(), timeoutMs: 10_000 };
    const snap = await snapshotRoot(repo, options);
    expect(await diffStats(snap, snap.tree, snap.tree, options)).toEqual([]);
  });
});
