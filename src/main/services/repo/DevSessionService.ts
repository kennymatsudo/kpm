/**
 * DevSessionService - Manages development sessions for plan item implementation
 *
 * Each session:
 * - Creates an isolated git worktree from master/main
 * - Persists across app restarts
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  IDevSessionRepository,
  IPlanItemRepository,
  IProjectRepository,
  IRepoRepository,

interface AgentContextInput {
  item: PlanItem;
  project: Project;
  children: PlanItem[];
  parent: PlanItem | null;
}

/**
 * Build agent context from plan item data
 */
  const sections: string[] = [];

  // Task title
  sections.push(`# Task: ${item.title}`);

  // Tracker reference (just the key for commit messages)
  if (item.external_key) {
    sections.push(`**Ticket:** ${item.external_key}`);
  }


  // Sub-tasks
  if (children.length > 0) {
    sections.push('## Sub-tasks');
    sections.push(children.map((c) => `- [ ] ${c.title}`).join('\n'));
  }

  if (parent) {
    sections.push('## Parent Context');
    sections.push(`This is part of: **${parent.title}**`);
  }

  // Code refs
    sections.push('## Relevant Files');
  }

  // Instructions
  sections.push('---');
  sections.push('## Instructions');
  if (item.external_key) {
    sections.push(`Ticket reference for commits: **${item.external_key}**`);
  }

  return sections.join('\n\n');
}

export interface DevSessionServiceDeps {
  devSessions: IDevSessionRepository;
  planItems: IPlanItemRepository;
  projects: IProjectRepository;
  repos: IRepoRepository;

/**
 */
  const slug = item.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  }

}

/**
 * Get the worktrees directory for a repo
 */
function getWorktreesDir(repoPath: string): string {
  const repoName = path.basename(repoPath);
  return path.join(path.dirname(repoPath), `.kpm-worktrees`, repoName);
}

/**
 * Detect the default branch (main or master)
 */
async function detectDefaultBranch(repoPath: string): Promise<string> {
  try {
      { cwd: repoPath }
    );
    const ref = stdout.trim();
    return ref.replace('refs/remotes/origin/', '').replace('refs/heads/', '');
  } catch {
    return 'main';
  }
}

export function createDevSessionService(deps: DevSessionServiceDeps) {
    /**
     * Get all sessions for a project
     */
    getByProject(projectId: string): DevSession[] {
      return deps.devSessions.getByProject(projectId);
    },

    /**
     * Get sessions with plan item data for display
     */
    getByProjectWithPlanItems(projectId: string): DevSessionWithPlanItem[] {
    },

    /**
     * Get active sessions for a project
     */
    getActiveSessions(projectId: string): DevSession[] {
      return deps.devSessions.getActiveSessions(projectId);
    },

    /**
     * Get a session by ID
     */
    get(id: string): DevSession | undefined {
      return deps.devSessions.get(id);
    },

    /**
     * Check if a plan item has an active session
     */
    hasActiveSession(planItemId: string): boolean {
      return !!deps.devSessions.getActiveByPlanItem(planItemId);
    },

    /**
     * Create a pending session (awaiting user approval)
     */
    async createPendingSession(
      planItemId: string,
      repoId: string,
      try {
        // Validate plan item exists
        const item = deps.planItems.get(planItemId);
        if (!item) {
          return failure(`Plan item not found: ${planItemId}`);
        }

        // Validate repo exists
        const repo = deps.repos.getById(repoId);
        if (!repo) {
          return failure(`Repository not found: ${repoId}`);
        }

        }


        // Generate branch name and worktree path
        const worktreesDir = getWorktreesDir(repo.path);
        const worktreePath = path.join(worktreesDir, branchName.replace(/\//g, '-'));

        const session = deps.devSessions.create({
          project_id: item.project_id!,
          plan_item_id: planItemId,
          repo_id: repoId,
          worktree_path: worktreePath,
          branch_name: branchName,
          base_branch: baseBranch,
          status: 'pending',
          initial_instructions: instructions,
        });

        return success(session);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    /**
     * Update session status
     */
    updateStatus(sessionId: string, status: DevSessionStatus): void {
      deps.devSessions.updateStatus(sessionId, status);

      // Broadcast status change to UI
      const updatedSession = deps.devSessions.get(sessionId);
      if (updatedSession) {
        broadcastSessionStatusChange(updatedSession);
      }
    },

    /**
     */
    async deleteSession(
      sessionId: string,
      try {
        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }

        // Clean up worktree if requested and it exists
        if (cleanupWorktree && fs.existsSync(session.worktree_path)) {
          const repo = deps.repos.getById(session.repo_id);
          if (repo) {
            try {
                { cwd: repo.path }
              );
            } catch {
              // If worktree remove fails, try manual cleanup
              fs.rmSync(session.worktree_path, { recursive: true, force: true });
            }
          }
        }

        // Delete session record
        deps.devSessions.delete(sessionId);

        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    /**
     * Get git diff for a session's worktree
     */
      try {
        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }

        if (!fs.existsSync(session.worktree_path)) {
          return failure(`Worktree not found: ${session.worktree_path}`);
        }

          { cwd: session.worktree_path, maxBuffer: 10 * 1024 * 1024 }
        );

        return success(stdout);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    /**
     * Get commit count ahead of base branch
     */
      try {
        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }

        if (!fs.existsSync(session.worktree_path)) {
          return success(0);
        }

          { cwd: session.worktree_path }
        );

        return success(parseInt(stdout.trim(), 10) || 0);
      } catch {
        return success(0);
      }
    },

    /**
     */
    },
  };
}

export type DevSessionService = ReturnType<typeof createDevSessionService>;
