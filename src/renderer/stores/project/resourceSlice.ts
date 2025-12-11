
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
});
