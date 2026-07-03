import type { Worktree } from '../../shared/types';

export function getWorktreesByProject(payload: { projectId: string }): Promise<Worktree[]> {
  return window.api.worktrees.getByProject(payload);
}

export function deleteWorktree(payload: { worktreeId: string; force?: boolean }): Promise<{ success: boolean; error?: string }> {
  return window.api.worktrees.delete(payload);
}

export function destroyWorktree(payload: { worktreeId: string }): Promise<{ success: boolean; error?: string }> {
  return window.api.worktrees.destroy(payload);
}
