/**
 * DevSessionService - Manages development sessions for plan item implementation
 *
 * Each session:
 * - Creates an isolated git worktree from master/main
 * - Tracks status (pending → active → inactive)
 * - Persists across app restarts
 */

import * as fs from 'fs';
import * as path from 'path';
} from '../../../shared/types';
import type {
  IDevSessionRepository,
  IPlanItemRepository,
  IProjectRepository,
  IRepoRepository,
} from '../../db/interfaces';

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
    // Try to get the remote HEAD reference using safe array arguments
    const { stdout } = await gitExec(
      ['symbolic-ref', 'refs/remotes/origin/HEAD'],
      { cwd: repoPath }
    );
    const ref = stdout.trim();
    return ref.replace('refs/remotes/origin/', '').replace('refs/heads/', '');
  } catch {
    // Fallback to 'main' if remote HEAD not found
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
    ): AsyncResult<DevSession> {
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

        // Broadcast new session to UI
        broadcastSessionStatusChange(session);

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
     * This is the unified action for stopping/removing sessions.
     */
    async deleteSession(
      sessionId: string,
    ): AsyncResult<void> {
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
              await gitExec(
                ['worktree', 'remove', session.worktree_path, '--force'],
                { cwd: repo.path }
              );
            } catch {
              // If worktree remove fails, try manual cleanup
              fs.rmSync(session.worktree_path, { recursive: true, force: true });
              await gitExec(['worktree', 'prune'], { cwd: repo.path });
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
    async getSessionDiff(sessionId: string): AsyncResult<string> {
      try {
        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }

        if (!fs.existsSync(session.worktree_path)) {
          return failure(`Worktree not found: ${session.worktree_path}`);
        }

        const { stdout } = await gitExec(
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
    async getCommitsAhead(sessionId: string): AsyncResult<number> {
      try {
        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }

        if (!fs.existsSync(session.worktree_path)) {
          return success(0);
        }

        const { stdout } = await gitExec(
          { cwd: session.worktree_path }
        );

        return success(parseInt(stdout.trim(), 10) || 0);
      } catch {
        return success(0);
      }
    },

    /**
     * Mark all active sessions as inactive (called on app startup)
     */
    markActiveAsInactive(): void {
      deps.devSessions.markActiveAsInactive();
    },
  };

  return service;
}

// =============================================================================
// Type Export
// =============================================================================

export type DevSessionService = ReturnType<typeof createDevSessionService>;
