import * as fs from 'fs';
import type {
  IWorktreeRepository,
  IPlanItemRepository,
  IProjectRepository,
  IRepoRepository,

export interface WorktreeServiceDeps {
  worktrees: IWorktreeRepository;
  planItems: IPlanItemRepository;
  projects: IProjectRepository;
  repos: IRepoRepository;
}

// Re-export types for consumers

  try {
    return success(await fn());
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}

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
        const worktree = deps.worktrees.get(worktreeId);
        if (!worktree) {
          throw new Error(`Worktree not found: ${worktreeId}`);
        }

        if (!fs.existsSync(worktree.worktree_path)) {
          throw new Error(`Worktree path does not exist: ${worktree.worktree_path}`);
        }

      });
    },

    /**
     * Get worktree status (commits ahead, etc.)
     */
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
        if (!force && fs.existsSync(worktree.worktree_path)) {
          try {
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
          }
        }

        // Remove git worktree
        if (fs.existsSync(worktree.worktree_path)) {
          try {
          } catch {
            // If worktree remove fails, try manual cleanup
            if (force) {
              fs.rmSync(worktree.worktree_path, { recursive: true, force: true });
            }
          }
        }

        // Delete the branch (if it exists and isn't checked out elsewhere)
        try {
        } catch {
          // Ignore branch deletion errors
        }

        // Remove from database
        deps.worktrees.delete(worktreeId);
      });
    },

    /**
     * Push worktree branch to remote
     */
      return wrapAsync(async () => {
        const worktree = deps.worktrees.get(worktreeId);
        if (!worktree) {
          throw new Error(`Worktree not found: ${worktreeId}`);
        }

        if (!fs.existsSync(worktree.worktree_path)) {
          throw new Error(`Worktree path does not exist: ${worktree.worktree_path}`);
        }

          cwd: worktree.worktree_path,
        });
      });
    },
  };
}
