import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, describe, expect, it } from 'vitest';

function runGit(repoPath: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoPath,
    encoding: 'utf-8',
  }).trim();
}

describe('getDiff', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('includes live worktree changes beyond HEAD when diffing against the base branch', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'git-utils-'));
    tempDirs.push(repoPath);

    runGit(repoPath, ['init', '-b', 'main']);
    runGit(repoPath, ['config', 'user.name', 'Test User']);
    runGit(repoPath, ['config', 'user.email', 'test@example.com']);

    const filePath = join(repoPath, 'feature.txt');
    writeFileSync(filePath, 'base\n');
    runGit(repoPath, ['add', 'feature.txt']);
    runGit(repoPath, ['commit', '-m', 'base']);

    runGit(repoPath, ['checkout', '-b', 'feature/worktree-pr-copy']);
    writeFileSync(filePath, 'committed change\n');
    runGit(repoPath, ['commit', '-am', 'committed change']);

    writeFileSync(filePath, 'live worktree change\n');

    const headOnlyDiff = runGit(repoPath, ['diff', 'main...HEAD']);
    const worktreeDiff = await getDiff(repoPath, 'main');

    expect(headOnlyDiff).toContain('committed change');
    expect(headOnlyDiff).not.toContain('live worktree change');
    expect(worktreeDiff).toContain('live worktree change');
  });
});

describe('findEnclosingGitRoot', () => {
  const tempDirs: string[] = [];
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  function freshTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'gitroot-find-'));
    tempDirs.push(dir);
    return dir;
  }

  it('returns the path itself when it is a repo root', () => {
    const root = freshTempDir();
    mkdirSync(join(root, '.git'));
    expect(findEnclosingGitRoot(root)).toBe(root);
  });

  it('walks up to find an enclosing repo', () => {
    const root = freshTempDir();
    mkdirSync(join(root, '.git'));
    const sub = join(root, 'a', 'b');
    mkdirSync(sub, { recursive: true });
    expect(findEnclosingGitRoot(sub)).toBe(root);
  });

  it('treats a .git file (worktree gitlink) as a valid root', () => {
    const root = freshTempDir();
    writeFileSync(join(root, '.git'), 'gitdir: /elsewhere\n', 'utf-8');
    expect(findEnclosingGitRoot(root)).toBe(root);
  });

  it('returns null when no repo exists up the tree', () => {
    const root = freshTempDir();
    expect(findEnclosingGitRoot(root)).toBeNull();
  });
});
