import type { Worktree } from '../../shared/types';

export function getWorktreesByProject(projectId: string): Promise<Worktree[]> {
  return window.api.worktrees.getByProject(projectId);
}

export function deleteWorktree(worktreeId: string): Promise<{ success: boolean; error?: string }> {
  return window.api.worktrees.delete(worktreeId);
}

export function destroyWorktree(worktreeId: string): Promise<{ success: boolean; error?: string }> {
  return window.api.worktrees.destroy(worktreeId);
}
