
export interface RepoServiceDeps {
  repos: IRepoRepository;
}

export function createRepoService(deps: RepoServiceDeps) {
  return {
    add(projectId: string, repoPath: string): ServiceResult<Repo> {
      try {
        const repo = deps.repos.add(projectId, repoPath);
        deps.watcher.watchRepo(repo.id, repoPath);
        return success(repo);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    remove(repoId: string): ServiceResult<void> {
      try {
        const repo = deps.repos.getById(repoId);
        if (repo) {
          deps.watcher.unwatchRepo(repo.path);
        }
        deps.repos.remove(repoId);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    list(projectId: string): ServiceResult<Repo[]> {
      try {
        return success(deps.repos.getByProject(projectId));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    getBranch(repoPath: string): ServiceResult<string | null> {
      try {
        return success(deps.watcher.getBranch(repoPath));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    getBranches(paths: string[]): ServiceResult<Record<string, string | null>> {
      try {
        return success(deps.watcher.getBranches(paths));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    watch(repoId: string, repoPath: string): ServiceResult<void> {
      try {
        deps.watcher.watchRepo(repoId, repoPath);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    unwatch(repoPath: string): ServiceResult<void> {
      try {
        deps.watcher.unwatchRepo(repoPath);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

