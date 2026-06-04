import * as fs from 'fs';
import type { Worktree, WorktreeStatus } from '../../../shared/types';
import type {
  IWorktreeRepository,
  IPlanItemRepository,
  IProjectRepository,
  IRepoRepository,
} from '../../db/interfaces';
import { gitExec } from './gitUtils';
import { openDirectoryInCodeEditor } from './editorLauncher';

export interface WorktreeServiceDeps {
  worktrees: IWorktreeRepository;
  planItems: IPlanItemRepository;
  projects: IProjectRepository;
  repos: IRepoRepository;
}

// Re-export types for consumers
export type { WorktreeStatus } from '../../../shared/types';

async function wrapAsync<T>(fn: () => Promise<T>): AsyncResult<T> {
  try {
    return success(await fn());
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * WorktreeService - Manages git worktrees for plan items
 *
 * NOTE: Agent launching has been moved to DevSessionService which uses
 * the integrated terminal. This service now only provides worktree
 * management utilities (open in editor, delete, status, etc.).
 */
export function createWorktreeService(deps: WorktreeServiceDeps) {
  return {
    /**
     * Get all worktrees for a project
     */
    getByProject(projectId: string): Worktree[] {
      return deps.worktrees.getByProject(projectId);
    },

    /**
     * Get worktree for a specific plan item
     */
    getByPlanItem(planItemId: string): Worktree | undefined {
      return deps.worktrees.getByPlanItem(planItemId);
    },

    /**
     * Open worktree in default code editor
     */
    async openInEditor(worktreeId: string): AsyncResult<void> {
      return wrapAsync(async () => {
        const worktree = deps.worktrees.get(worktreeId);
        if (!worktree) {
          throw new Error(`Worktree not found: ${worktreeId}`);
        }

        if (!fs.existsSync(worktree.worktree_path)) {
          throw new Error(`Worktree path does not exist: ${worktree.worktree_path}`);
        }

        await openDirectoryInCodeEditor(worktree.worktree_path);
      });
    },

    /**
     * Get worktree status (commits ahead, etc.)
     */
    async getStatus(worktreeId: string): AsyncResult<WorktreeStatus> {
      return wrapAsync(async () => {
        const worktree = deps.worktrees.get(worktreeId);
        if (!worktree) {
          throw new Error(`Worktree not found: ${worktreeId}`);
        }

        let commitsAhead = 0;
        let hasUnpushedCommits = false;
        let branchExists = false;

        if (fs.existsSync(worktree.worktree_path)) {
          branchExists = true;
          try {
            // Check commits ahead of main
            const { stdout } = await gitExec(
              ['rev-list', '--count', 'origin/main..HEAD'],
              { cwd: worktree.worktree_path }
            );
            commitsAhead = parseInt(stdout.trim(), 10) || 0;
            hasUnpushedCommits = commitsAhead > 0;
          } catch {
            // Ignore errors - might not have remote
          }
        }

        return { worktree, commitsAhead, hasUnpushedCommits, branchExists };
      });
    },

    /**
     * Delete a worktree
     */
    async deleteWorktree(worktreeId: string, force = false): AsyncResult<void> {
      return wrapAsync(async () => {
        const worktree = deps.worktrees.get(worktreeId);
        if (!worktree) {
          throw new Error(`Worktree not found: ${worktreeId}`);
        }

        const item = deps.planItems.get(worktree.plan_item_id);
        if (!item) {
          // Plan item deleted, just clean up DB record
          deps.worktrees.delete(worktreeId);
          return;
        }

        const project = deps.projects.get(worktree.project_id);
        if (!project) {
          deps.worktrees.delete(worktreeId);
          return;
        }

        const repos = deps.repos.getByProject(project.id);
        if (repos.length === 0) {
          deps.worktrees.delete(worktreeId);
          return;
        }

        const repoPath = repos[0].path;

        // Check for unpushed commits if not forcing
        // Use @{u} (upstream) instead of origin/main to avoid network calls
        if (!force && fs.existsSync(worktree.worktree_path)) {
          try {
            const { stdout } = await gitExec(
              ['rev-list', '--count', '@{u}..HEAD'],
              { cwd: worktree.worktree_path }
            );
            const commitsAhead = parseInt(stdout.trim(), 10) || 0;
            if (commitsAhead > 0) {
              throw new Error(`Worktree has ${commitsAhead} unpushed commits. Use force=true to delete anyway.`);
            }
          } catch (error) {
            if (error instanceof Error && error.message.includes('unpushed commits')) {
              throw error;
            }
            // Ignore other errors (e.g., no upstream set)
          }
        }

        // Remove git worktree
        if (fs.existsSync(worktree.worktree_path)) {
          try {
            const removeArgs = ['worktree', 'remove', worktree.worktree_path];
            if (force) {
              removeArgs.push('--force');
            }
            await gitExec(removeArgs, { cwd: repoPath });
          } catch {
            // If worktree remove fails, try manual cleanup
            if (force) {
              fs.rmSync(worktree.worktree_path, { recursive: true, force: true });
              await gitExec(['worktree', 'prune'], { cwd: repoPath });
            }
          }
        }

        // Delete the branch (if it exists and isn't checked out elsewhere)
        try {
          await gitExec(['branch', '-d', worktree.branch_name], { cwd: repoPath });
        } catch {
          // Ignore branch deletion errors
        }

        // Remove from database
        deps.worktrees.delete(worktreeId);
      });
    },

    /**
     * Destroy a worktree completely - removes directory, force-deletes local branch,
     * and deletes the remote tracking branch. Intended for discarding unwanted work.
     */
    async destroyWorktree(worktreeId: string): AsyncResult<void> {
      return wrapAsync(async () => {
        const worktree = deps.worktrees.get(worktreeId);
        if (!worktree) {
          throw new Error(`Worktree not found: ${worktreeId}`);
        }

        const item = deps.planItems.get(worktree.plan_item_id);
        if (!item) {
          deps.worktrees.delete(worktreeId);
          return;
        }

        const project = deps.projects.get(worktree.project_id);
        if (!project) {
          deps.worktrees.delete(worktreeId);
          return;
        }

        const repos = deps.repos.getByProject(project.id);
        if (repos.length === 0) {
          deps.worktrees.delete(worktreeId);
          return;
        }

        const repoPath = repos[0].path;

        // Force-remove git worktree
        if (fs.existsSync(worktree.worktree_path)) {
          try {
            await gitExec(['worktree', 'remove', worktree.worktree_path, '--force'], { cwd: repoPath });
          } catch {
            // Manual cleanup if git worktree remove fails
            fs.rmSync(worktree.worktree_path, { recursive: true, force: true });
            await gitExec(['worktree', 'prune'], { cwd: repoPath });
          }
        }

        // Force-delete local branch (-D ignores merge status)
        try {
          await gitExec(['branch', '-D', worktree.branch_name], { cwd: repoPath });
        } catch {
          // Ignore branch deletion errors
        }

        // Delete remote tracking branch (best-effort, don't fail if remote is gone)
        try {
          await gitExec(['push', 'origin', '--delete', worktree.branch_name], { cwd: repoPath });
        } catch {
          // Ignore remote deletion errors (branch may not be pushed)
        }

        // Remove from database
        deps.worktrees.delete(worktreeId);
      });
    },

    /**
     * Push worktree branch to remote
     */
    async pushBranch(worktreeId: string): AsyncResult<void> {
      return wrapAsync(async () => {
        const worktree = deps.worktrees.get(worktreeId);
        if (!worktree) {
          throw new Error(`Worktree not found: ${worktreeId}`);
        }

        if (!fs.existsSync(worktree.worktree_path)) {
          throw new Error(`Worktree path does not exist: ${worktree.worktree_path}`);
        }

        await gitExec(['push', '-u', 'origin', worktree.branch_name], {
          cwd: worktree.worktree_path,
        });
      });
    },
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type WorktreeService = ReturnType<typeof createWorktreeService>;
