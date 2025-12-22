import type { ResourceSlice, SliceCreator, WorktreeOperation } from './types';

/** Helper to set loading state for a worktree operation */
const setWorktreeLoading = (
  set: Parameters<ReturnType<SliceCreator<ResourceSlice>>>[0],
  id: string,
  operation: WorktreeOperation | null
) => {
  set((state) => ({
    worktreeLoading: { ...state.worktreeLoading, [id]: operation },
  }));
};

  setRepos: (repos) => set({ repos }),
  setAttachments: (attachments) => set({ attachments }),
  addRepo: (repo) => set((state) => ({ repos: [...state.repos, repo] })),
  removeRepo: (repoId) => set((state) => {
    // Also remove the branch entry when removing a repo
    const { [repoId]: _, ...remainingBranches } = state.repoBranches;
    return {
      repos: state.repos.filter((r) => r.id !== repoId),
      repoBranches: remainingBranches,
    };
  }),
  addAttachment: (attachment) => set((state) => ({
    attachments: [...state.attachments, attachment],
  })),
  removeAttachment: (attachmentId) => set((state) => ({
    attachments: state.attachments.filter((a) => a.id !== attachmentId),
  })),
  setRepoBranches: (branches) => set({ repoBranches: branches }),
  setRepoBranch: (repoId, branch) => set((state) => ({
    repoBranches: { ...state.repoBranches, [repoId]: branch },
  })),
  // Worktree actions
  addWorktree: (worktree) => set((state) => ({
  })),
  removeWorktree: (worktreeId) => set((state) => ({
  })),
  openWorktreeInEditor: async (worktreeId) => {
    setWorktreeLoading(set, worktreeId, 'openEditor');
    try {
      const result = await deps.api.worktrees.openEditor(worktreeId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to open editor');
      }
    } finally {
      setWorktreeLoading(set, worktreeId, null);
    }
  },
  deleteWorktree: async (worktreeId, force = false) => {
    try {
      const result = await deps.api.worktrees.delete(worktreeId, force);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete worktree');
      }
      set((state) => {
        const { [worktreeId]: _, ...remainingLoading } = state.worktreeLoading;
        return {
          worktreeLoading: remainingLoading,
        };
      });
    } catch (error) {
      throw error;
    }
  },
});
