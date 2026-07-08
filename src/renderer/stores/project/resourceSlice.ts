import type { ResourceSlice, SliceCreator } from './types';

export const createResourceSlice: SliceCreator<ResourceSlice> = (deps) => (set, get) => ({
  setRepos: (repos) => set({ repos }),
  setAttachments: (attachments) => set({ attachments }),
  addRepo: (repo) => set((state) => ({ repos: [...state.repos, repo] })),
  addReposToProject: async (projectId, repoPaths) => {
    if (repoPaths.length === 0) return [];

    const repos = await Promise.all(repoPaths.map((path) => deps.api.repos.add({ projectId, path })));
    const effectivePaths = repos.map((repo) => repo.active_worktree_path ?? repo.path);
    const branchesByPath = await deps.api.repos.getBranches({ paths: effectivePaths });

    await Promise.all(repos.map((repo) => deps.api.repos.watch({ repoId: repo.id, path: repo.active_worktree_path ?? repo.path })));

    set((state) => ({
      repos: [...state.repos, ...repos],
      repoBranches: {
        ...state.repoBranches,
        ...Object.fromEntries(repos.map((repo) => [repo.id, branchesByPath[repo.active_worktree_path ?? repo.path] ?? null])),
      },
    }));

    return repos;
  },
  addReposFromDialog: async (projectId) => {
    const repoPaths = await deps.api.repos.selectDialog();
    if (repoPaths.length === 0) return [];
    return get().addReposToProject(projectId, repoPaths);
  },
  removeRepo: (repoId) => set((state) => {
    // Also remove the branch entry when removing a repo
    const { [repoId]: _, ...remainingBranches } = state.repoBranches;
    return {
      repos: state.repos.filter((r) => r.id !== repoId),
      repoBranches: remainingBranches,
    };
  }),
  removeRepoFromProject: async (_projectId, repoId) => {
    const repo = get().repos.find((entry) => entry.id === repoId);

    await deps.api.repos.remove({ repoId });

    if (repo) {
      await deps.api.repos.unwatch({ path: repo.active_worktree_path ?? repo.path }).catch(() => undefined);
    }

    get().removeRepo(repoId);
  },
  addAttachment: (attachment) => set((state) => ({
    attachments: [...state.attachments, attachment],
  })),
  removeAttachment: (attachmentId) => set((state) => ({
    attachments: state.attachments.filter((a) => a.id !== attachmentId),
  })),
  refreshRepos: async (projectId) => {
    const repos = await deps.api.repos.list({ projectId });
    const effectivePaths = repos.map((r) => r.active_worktree_path ?? r.path);
    const branchesByPath = repos.length > 0
      ? await deps.api.repos.getBranches({ paths: effectivePaths })
      : {};

    set({
      repos,
      repoBranches: Object.fromEntries(
        repos.map((repo) => [repo.id, branchesByPath[repo.active_worktree_path ?? repo.path] ?? null])
      ),
    });

    return repos;
  },
  setRepoBranches: (branches) => set({ repoBranches: branches }),
  setRepoBranch: (repoId, branch) => set((state) => ({
    repoBranches: { ...state.repoBranches, [repoId]: branch },
  })),
  updateRepoEnvironmentMode: async (projectId, repoId, mode) => {
    const result = await deps.api.repos.updateEnvironmentMode({ repoId, mode });
    if (!result.success) {
      return false;
    }

    await get().refreshRepos(projectId);
    return true;
  },
  setActiveWorktreePath: async (projectId, repoId, worktreePath) => {
    const repo = get().repos.find((r) => r.id === repoId);
    if (!repo) return false;

    const result = await deps.api.repos.setActiveWorktreePath({ repoId, worktreePath });
    if (!result.success) return false;

    // Update local state immediately
    set((state) => ({
      repos: state.repos.map((r) =>
        r.id === repoId ? { ...r, active_worktree_path: worktreePath } : r
      ),
    }));

    // Re-watch with new effective path so branch badge reflects the worktree
    const oldPath = repo.active_worktree_path ?? repo.path;
    const newPath = worktreePath ?? repo.path;
    if (oldPath !== newPath) {
      await deps.api.repos.unwatch({ path: oldPath }).catch(() => undefined);
      await deps.api.repos.watch({ repoId, path: newPath });
      const branch = await deps.api.repos.getBranch({ path: newPath }).catch(() => null);
      get().setRepoBranch(repoId, branch);

      // Disconnect active chat sessions so the next message picks up the new cwd.
      // The SDK bakes cwd into the session at spawn time; stale sessions would
      // still run git commands from the old repo path.
      await deps.api.chat.disconnectSession({ projectId }).catch((err: unknown) => {
        console.warn('[resourceSlice] Failed to disconnect chat session after worktree change', err);
      });
    }

    return true;
  },
});
