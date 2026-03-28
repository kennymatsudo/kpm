import type * as fs from 'fs';
import type * as path from 'path';
import type { Repo, RepoEnvironmentMode } from '../../../shared/types';
import type { IRepoRepository } from '../../db/interfaces';
import type { RepoWatcherService } from './RepoWatcherService';
import { failure, success, type ServiceResult, type AsyncResult, wrapAsync } from '../result';

interface RepoFs {
  readdirSync: typeof fs.readdirSync;
}

interface RepoPath {
  join: typeof path.join;
  relative: typeof path.relative;
}

export interface RepoServiceDeps {
  repos: IRepoRepository;
  watcher: RepoWatcherService;
  fs: RepoFs;
  path: RepoPath;
  gitExec: typeof gitExec;
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

    async getBranchesAsync(paths: string[]): AsyncResult<Record<string, string | null>> {
      return wrapAsync(() => deps.watcher.getBranchesAsync(paths), 'Failed to get repo branches');
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

    updateEnvironmentMode(repoId: string, mode: RepoEnvironmentMode): ServiceResult<void> {
      try {
        deps.repos.updateEnvironmentMode(repoId, mode);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    listDirectories(repoPath: string, prefix: string, depth: number): ServiceResult<string[]> {
      try {
        const skipDirs = new Set([
          'node_modules', '.git', '__pycache__', 'dist', 'build', '.next',
          '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache', 'target',
          '.gradle', '.idea', '.vscode', 'coverage', '.turbo', '.cache',
        ]);
        const maxResults = 50;
        const results: string[] = [];

        const walk = (dir: string, currentDepth: number): void => {
          if (currentDepth > depth || results.length >= maxResults) return;

          let entries: fs.Dirent[];
          try {
            entries = deps.fs.readdirSync(dir, { withFileTypes: true });
          } catch {
            return;
          }

          for (const entry of entries) {
            if (!entry.isDirectory() || skipDirs.has(entry.name) || entry.name.startsWith('.')) continue;

            const relPath = deps.path.relative(repoPath, deps.path.join(dir, entry.name));
            const relPathWithSlash = `${relPath}/`;
              results.push(relPathWithSlash);
              if (results.length >= maxResults) return;
            }

              walk(deps.path.join(dir, entry.name), currentDepth + 1);
            }
          }
        };

        walk(repoPath, 1);
        return success(results.sort());
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    async listAllBranches(repoPath: string): AsyncResult<string[]> {
      return wrapAsync(async () => {
        const { stdout } = await deps.gitExec(
          ['for-each-ref', '--format=%(refname:short)', '--sort=-committerdate', 'refs/heads/'],
          { cwd: repoPath },
        );
        return stdout.trim().split('\n').filter(Boolean);
      }, 'Failed to list all branches');
    },
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type RepoService = ReturnType<typeof createRepoService>;
