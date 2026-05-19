import type * as fs from 'fs';
import type * as path from 'path';
import type { Repo, RepoEnvironmentMode } from '../../../shared/types';
import type { IRepoRepository } from '../../db/interfaces';
import type { RepoWatcherService } from './RepoWatcherService';
import { failure, success, type ServiceResult, type AsyncResult, wrapAsync } from '../result';
import type { gitExec } from './gitUtils';

interface RepoFs {
  readdirSync: typeof fs.readdirSync;
}

interface RepoPath {
  join: typeof path.join;
  relative: typeof path.relative;
  dirname: typeof path.dirname;
  basename: typeof path.basename;
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

    getPath(repoId: string): ServiceResult<string> {
      try {
        const repo = deps.repos.getById(repoId);
        return repo ? success(repo.path) : failure('Repository not found');
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

        const prefixLower = prefix.toLowerCase();

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
            const relLower = relPathWithSlash.toLowerCase();

            // Check if this dir is an ancestor of the target prefix,
            // or if it matches/extends the prefix
            const isAncestor = prefixLower.startsWith(relLower);
            const isMatch = relLower.startsWith(prefixLower);

            if (!prefix || isMatch) {
              // Only include directories that match/extend the prefix,
              // not ancestor directories (e.g. typing "src/learning/app"
              // should not show "src/" or "src/learning/" as suggestions)
              results.push(relPathWithSlash);
              if (results.length >= maxResults) return;
            }

            // Only recurse into directories that could contain matches:
            // ancestors of the target, or the target and its descendants
            if (currentDepth < depth && (!prefix || isAncestor || isMatch)) {
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

    async listWorktrees(repoPath: string): AsyncResult<{ path: string; branch: string | null; isMain: boolean }[]> {
      return wrapAsync(async () => {
        const { stdout } = await deps.gitExec(['worktree', 'list', '--porcelain'], { cwd: repoPath });
        const worktrees: { path: string; branch: string | null; isMain: boolean }[] = [];
        let current: { path?: string; branch?: string | null } = {};
        let isFirst = true;

        for (const line of stdout.trim().split('\n')) {
          if (line.startsWith('worktree ')) {
            if (current.path !== undefined) {
              worktrees.push({ path: current.path, branch: current.branch ?? null, isMain: isFirst });
              isFirst = false;
            }
            current = { path: line.slice('worktree '.length) };
          } else if (line.startsWith('branch ')) {
            current.branch = line.slice('branch refs/heads/'.length);
          } else if (line === '') {
            if (current.path !== undefined) {
              worktrees.push({ path: current.path, branch: current.branch ?? null, isMain: isFirst });
              isFirst = false;
              current = {};
            }
          }
        }
        if (current.path !== undefined) {
          worktrees.push({ path: current.path, branch: current.branch ?? null, isMain: isFirst });
        }

        return worktrees;
      }, 'Failed to list worktrees');
    },

    setActiveWorktreePath(repoId: string, worktreePath: string | null): ServiceResult<void> {
      try {
        deps.repos.updateActiveWorktreePath(repoId, worktreePath);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type RepoService = ReturnType<typeof createRepoService>;
