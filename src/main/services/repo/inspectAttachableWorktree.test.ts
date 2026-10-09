import { execFileSync } from 'child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectAttachableWorktree } from './worktreeScaffold';

// Real git, kept apart from worktreeScaffold.test.ts, which mocks fs and git.

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

function createRepo(root: string): string {
  const repoPath = join(root, 'repo');
  execFileSync('git', ['init', '-b', 'main', repoPath]);
  runGit(repoPath, ['config', 'user.name', 'Test User']);
  runGit(repoPath, ['config', 'user.email', 'test@example.com']);
  writeFileSync(join(repoPath, 'a.txt'), 'a\n');
  runGit(repoPath, ['add', 'a.txt']);
  runGit(repoPath, ['commit', '-m', 'base']);
  return repoPath;
}

describe('inspectAttachableWorktree', () => {
  const roots: string[] = [];
  const makeRoot = () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'attach-worktree-')));
    roots.push(root);
    return root;
  };

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('accepts a linked worktree of the repo and reports its branch', async () => {
    const root = makeRoot();
    const repoPath = createRepo(root);
    const worktreePath = join(root, 'feature');
    runGit(repoPath, ['worktree', 'add', '-b', 'feature/outside', worktreePath]);

    const result = await inspectAttachableWorktree({ worktreePath, repoPath });

    expect(result).toEqual({ ok: true, data: { worktreePath, branchName: 'feature/outside' } });
  });

  it('refuses the primary checkout', async () => {
    const repoPath = createRepo(makeRoot());

    const result = await inspectAttachableWorktree({ worktreePath: repoPath, repoPath });

    expect(result.ok).toBe(false);
  });

  it('refuses the main checkout when the connected path is a linked worktree', async () => {
    const root = makeRoot();
    const repoPath = createRepo(root);
    const connectedPath = join(root, 'connected');
    runGit(repoPath, ['worktree', 'add', '-b', 'connected', connectedPath]);

    const result = await inspectAttachableWorktree({ worktreePath: repoPath, repoPath: connectedPath });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('main checkout') });
  });

  it('refuses a worktree with a detached HEAD', async () => {
    const root = makeRoot();
    const repoPath = createRepo(root);
    const worktreePath = join(root, 'detached');
    runGit(repoPath, ['worktree', 'add', '--detach', worktreePath]);

    const result = await inspectAttachableWorktree({ worktreePath, repoPath });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('no branch') });
  });

  it('refuses a checkout of a different repository', async () => {
    const repoPath = createRepo(makeRoot());
    const otherRepo = createRepo(makeRoot());

    const result = await inspectAttachableWorktree({ worktreePath: otherRepo, repoPath });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('different repository') });
  });
});
