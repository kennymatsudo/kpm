import { describe, expect, it } from 'vitest';
import { parseWorktreeListPorcelain } from './worktreeList';

describe('parseWorktreeListPorcelain', () => {
  it('reads branch, detached, bare, and prunable worktrees, marking only the first as main', () => {
    const stdout = [
      'worktree /repos/app',
      'HEAD 1111111111111111111111111111111111111111',
      'branch refs/heads/main',
      '',
      'worktree /repos/app-feature',
      'HEAD 2222222222222222222222222222222222222222',
      'branch refs/heads/feature/nested-name',
      'locked',
      '',
      'worktree /repos/app-detached',
      'HEAD 3333333333333333333333333333333333333333',
      'detached',
      '',
      'worktree /repos/app-gone',
      'HEAD 4444444444444444444444444444444444444444',
      'branch refs/heads/gone',
      'prunable gitdir file points to non-existent location',
      '',
    ].join('\n');

    expect(parseWorktreeListPorcelain(stdout)).toEqual([
      { path: '/repos/app', branch: 'main', isMain: true, bare: false, detached: false, prunable: false },
      { path: '/repos/app-feature', branch: 'feature/nested-name', isMain: false, bare: false, detached: false, prunable: false },
      { path: '/repos/app-detached', branch: null, isMain: false, bare: false, detached: true, prunable: false },
      { path: '/repos/app-gone', branch: 'gone', isMain: false, bare: false, detached: false, prunable: true },
    ]);
  });

  it('reads a bare main repository without a trailing blank line', () => {
    expect(parseWorktreeListPorcelain('worktree /repos/app.git\nbare')).toEqual([
      { path: '/repos/app.git', branch: null, isMain: true, bare: true, detached: false, prunable: false },
    ]);
  });
});
