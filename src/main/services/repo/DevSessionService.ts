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
import { randomUUID } from 'crypto';
} from '../../../shared/types';
import type {
  IAppSettingsRepository,
  IDevSessionRepository,
  IPlanItemRepository,
  IProjectRepository,
  IRepoRepository,
} from '../../db/interfaces';
import {
  createStatusBroadcaster,
} from './sessionOrchestration';

interface AgentContextInput {
  item: PlanItem;
  project: Project;
  children: PlanItem[];
  parent: PlanItem | null;
}

/**
 * Build agent context from plan item data
 */
  const { item, children, parent } = input;
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

  // Parent context (only title, not full description - task should be self-contained)
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
  appSettings: IAppSettingsRepository;
  userDataPath: string;
}
const broadcastSessionStatusChange = createStatusBroadcaster<DevSession>('dev-session:status-changed');

/**
 * Generate branch name from plan item using template
 *
 * Template variables:
 * - {date}   - YYYYMM (e.g., 202601)
 * - {ticket} - External key (e.g., PROJ-123)
 * - {name}   - Plan item title slug
 * - {id}     - Plan item ID prefix (6 chars)
 *
 * Smart default when template is empty:
 * - If ticket exists: {ticket}-{name}
 * - Otherwise: {id}-{name}
 */
function generateBranchName(item: PlanItem, template: string | undefined): string {
  const slug = item.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  // If no template, use smart default
  if (!template || template.trim() === '') {
    if (item.external_key) {
      return `${item.external_key}-${slug}`;
    }
    return `${item.id.substring(0, 6)}-${slug}`;
  }

  // Build date string (YYYYMM)
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Apply template substitutions
  let branchName = template
    .replace(/{date}/g, dateStr)
    .replace(/{ticket}/g, item.external_key || '')
    .replace(/{name}/g, slug)
    .replace(/{id}/g, item.id.substring(0, 6));

  // Clean up double separators and trailing/leading separators
  branchName = branchName
    .replace(/[_\-/]{2,}/g, (match) => match[0])  // Collapse multiple separators
    .replace(/^[_\-/]+/, '')  // Remove leading separators
    .replace(/[_\-/]+$/, ''); // Remove trailing separators

  return branchName;
}

/**
 * Get the worktrees directory for a repo
 */
function getWorktreesDir(repoPath: string): string {
  const repoName = path.basename(repoPath);
  return path.join(path.dirname(repoPath), `.kpm-worktrees`, repoName);
}

/**
 * Check if a branch exists in the repo
 */
async function branchExists(repoPath: string, branchName: string): Promise<boolean> {
  try {
    await gitExec(['rev-parse', '--verify', `refs/heads/${branchName}`], { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a unique branch name by appending -v2, -v3, etc. if needed
 */
async function generateUniqueBranchName(repoPath: string, baseBranchName: string): Promise<string> {
  // First check if base name is available
  if (!(await branchExists(repoPath, baseBranchName))) {
    return baseBranchName;
  }

  // Find next available version
  let version = 2;
  while (version < 100) {
    const versionedName = `${baseBranchName}-v${version}`;
    if (!(await branchExists(repoPath, versionedName))) {
      return versionedName;
    }
    version++;
  }

  // Fallback to timestamp if somehow we have 100 versions
  return `${baseBranchName}-${Date.now()}`;
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
  const service = {
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
      instructions: string,
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

        // Check for existing active session (unless freshStart is requested)
        if (!options?.freshStart) {
          const existing = deps.devSessions.getActiveByPlanItem(planItemId);
          if (existing) {
            return failure(`Plan item already has an active session: ${existing.id}`);
          }
        }


        // Generate branch name and worktree path
        const template = deps.appSettings.get('branch_name_template');
        const baseBranchName = generateBranchName(item, template);
        // If freshStart, generate a unique branch name (adds -v2, -v3, etc.)
        const branchName = options?.freshStart
          ? await generateUniqueBranchName(repo.path, baseBranchName)
          : baseBranchName;
        const worktreesDir = getWorktreesDir(repo.path);
        const worktreePath = path.join(worktreesDir, branchName.replace(/\//g, '-'));

        const session = deps.devSessions.create({
          id: randomUUID(),
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
     * Check if a session's worktree has uncommitted changes
     * Used to warn before deletion
     */
    async checkDirty(
      sessionId: string
    ): AsyncResult<{ isDirty: boolean; files: string[] }> {
      try {
        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }

        // If worktree doesn't exist, nothing to lose
        if (!fs.existsSync(session.worktree_path)) {
          return success({ isDirty: false, files: [] });
        }

        // Check for uncommitted changes using git status --porcelain
        const { stdout } = await gitExec(
          ['status', '--porcelain'],
          { cwd: session.worktree_path }
        );

        const files = stdout
          .trim()
          .split('\n')
          .filter((line) => line.length > 0)
          .map((line) => line.slice(3)); // Remove status prefix (e.g., " M ", "?? ")

        return success({ isDirty: files.length > 0, files });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    /**
     * This is the unified action for stopping/removing sessions.
     */
    async deleteSession(
      sessionId: string,
      cleanupWorktree = true
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
     * Destroy a session completely - removes worktree, force-deletes local branch,
     * and deletes the remote tracking branch. Intended for discarding unwanted work.
     */
    async destroySession(sessionId: string): AsyncResult<void> {
      try {
        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }

        const repo = deps.repos.getById(session.repo_id);
        if (repo) {
          // Force-remove git worktree
          if (fs.existsSync(session.worktree_path)) {
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

          // Force-delete local branch (ignores merge status)
          try {
            await gitExec(
              ['branch', '-D', session.branch_name],
              { cwd: repo.path }
            );
          } catch {
            // Branch may already be deleted
          }

          // Delete remote tracking branch
          try {
            await gitExec(
              ['push', 'origin', '--delete', session.branch_name],
              { cwd: repo.path }
            );
          } catch {
            // Remote branch may not exist
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
