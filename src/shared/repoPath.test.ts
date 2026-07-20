import { describe, expect, it } from 'vitest';
import { resolveEffectiveRepoPath } from './repoPath';

describe('resolveEffectiveRepoPath', () => {
  it('returns the main checkout when no worktree is active', () => {
    expect(resolveEffectiveRepoPath({ path: '/repo', active_worktree_path: null })).toBe('/repo');
  });

  it('returns the main checkout when active_worktree_path is undefined', () => {
    expect(resolveEffectiveRepoPath({ path: '/repo' })).toBe('/repo');
  });

  it('returns the active worktree when one is set', () => {
    expect(
      resolveEffectiveRepoPath({ path: '/repo', active_worktree_path: '/repo/.kpm-worktrees/feature' })
    ).toBe('/repo/.kpm-worktrees/feature');
  });
});
