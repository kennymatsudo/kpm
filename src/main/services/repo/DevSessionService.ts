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
import { failure, success, type AsyncResult, type ServiceResult } from '../result';
} from '../../../shared/types';
import type {
  IAppSettingsRepository,
  IAgentReviewRepository,
  IDevSessionRepository,
  IPlanItemRepository,
  IProjectRepository,
  IRepoRepository,
} from '../../db/interfaces';
import { getClaudeSdkSpawnOptions } from '../../claude/findClaude';
import { getConfig } from '../../config';
import {
  createStatusBroadcaster,
} from './sessionOrchestration';
import type { AgentSessionManager } from '../agents/AgentSessionManager';

interface AgentContextInput {
  item: PlanItem;
  project: Project;
  children: PlanItem[];
  parent: PlanItem | null;
}

/**
 * Build agent context from plan item data
 * Note: Claude Code automatically reads CLAUDE.md/AGENTS.md from the worktree, so we don't include it here
 *
 * Exported for unit testing.
 */
export function buildAgentContext(input: AgentContextInput): string {
  const { item, children, parent } = input;
  const sections: string[] = [];

  // Task title
  sections.push(`# Task: ${item.title}`);

  // Tracker reference (just the key for commit messages)
  if (item.external_key) {
    sections.push(`**Ticket:** ${item.external_key}`);
  }

  // Intent — one-sentence commitment. What "done" means at a glance.
  if (item.intent) {
    sections.push('## Intent');
    sections.push(item.intent);
  }

  // Acceptance criteria — the contract the agent must satisfy.
  if (hasCriteria) {
    sections.push('## Acceptance Criteria');
  }

  // Description — rationale and context. Demoted to "Context" when structured fields carry the contract.
    sections.push(hasCriteria ? '## Context' : '## Description');
  } else if (!item.intent && !hasCriteria) {
    sections.push('## Description');
    sections.push('No description provided.');
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
  sections.push(hasCriteria
  if (item.external_key) {
    sections.push(`Ticket reference for commits: **${item.external_key}**`);
  }

  return sections.join('\n\n');
}

function buildLegacyBoardPrompt(item: Pick<PlanItem, 'title' | 'description'>): string {
  const parts: string[] = [item.title];
  if (item.description) {
    parts.push('', item.description);
  }
  return parts.join('\n').trim();
}

/**
 * Build the board-start prompt around the canonical structured task context.
 * If the user leaves the board editor at its legacy default (title/description),
 * omit that duplicate text and rely on the structured context alone.
 */
export function buildBoardStartInstructions(
  input: AgentContextInput & { userPrompt?: string | null }
): string {
  const structuredContext = buildAgentContext(input);
  const normalizedUserPrompt = input.userPrompt?.trim() ?? '';
  const legacyDefaultPrompt = buildLegacyBoardPrompt(input.item);

  if (
    normalizedUserPrompt.length === 0
    || normalizedUserPrompt === input.item.title.trim()
    || normalizedUserPrompt === legacyDefaultPrompt
  ) {
    return structuredContext;
  }

  return [
    structuredContext,
    '## Additional User Instructions',
    normalizedUserPrompt,
  ].join('\n\n');
}

export interface DevSessionServiceDeps {
  devSessions: IDevSessionRepository;
  planItems: IPlanItemRepository;
  projects: IProjectRepository;
  repos: IRepoRepository;
  appSettings: IAppSettingsRepository;
  agentReviews: IAgentReviewRepository;
  userDataPath: string;
  /** Optional — when provided, dev sessions use the Agent SDK instead of PTY */
  agentSessionManager?: AgentSessionManager;
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

// ---------------------------------------------------------------------------
// Worktree scaffolding helper
// ---------------------------------------------------------------------------

type WorktreeScaffoldResult =
  | { ok: true }
  | { ok: false; kind: 'checkedOutInMainRepo' }
  | { ok: false; kind: 'checkedOutElsewhere' }
  | { ok: false; kind: 'createFailed'; outerMessage: string; innerMessage: string };

/**
 * Ensure the worktrees directory exists and, if the worktree path is absent,
 * create it via `git worktree add`.  Returns a discriminated result so callers
 * can produce their own exact error messages.
 *
 * Preconditions: session fields `worktree_path`, `branch_name`, `base_branch`
 * must already be set; `repoPath` is the path of the primary checkout.
 */
async function _scaffoldWorktree(params: {
  worktreePath: string;
  branchName: string;
  baseBranch: string;
  repoPath: string;
}): Promise<WorktreeScaffoldResult> {
  const { worktreePath, branchName, baseBranch, repoPath } = params;

  // Ensure the parent worktrees directory exists
  const worktreesDir = path.dirname(worktreePath);
  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }

  // Nothing to do — worktree already present
  if (fs.existsSync(worktreePath)) {
    return { ok: true };
  }

  // Guard: never shadow the primary checkout's current branch
  const checkedOut = await getCurrentBranch(repoPath);
  if (checkedOut && checkedOut === branchName) {
    return { ok: false, kind: 'checkedOutInMainRepo' };
  }

  try {
    // Attempt to create a new branch from base
    await gitExec(
      ['worktree', 'add', '-b', branchName, worktreePath, baseBranch],
      { cwd: repoPath }
    );
    return { ok: true };
  } catch (outerError) {
    const outerMessage = outerError instanceof Error ? outerError.message : String(outerError);
    // Branch may already exist — retry without -b
    try {
      await gitExec(
        ['worktree', 'add', worktreePath, branchName],
        { cwd: repoPath }
      );
      return { ok: true };
    } catch (innerError) {
      const innerMessage = innerError instanceof Error ? innerError.message : String(innerError);
      if (innerMessage.includes('already checked out')) {
        return { ok: false, kind: 'checkedOutElsewhere' };
      }
      return { ok: false, kind: 'createFailed', outerMessage, innerMessage };
    }
  }
}

export function createDevSessionService(deps: DevSessionServiceDeps) {
  function getAgentContextInput(planItemId: string): ServiceResult<AgentContextInput> {
    const item = deps.planItems.get(planItemId);
    if (!item) {
      return failure(`Plan item not found: ${planItemId}`);
    }

    if (!item.project_id) {
      return failure(`Plan item has no project: ${planItemId}`);
    }

    const project = deps.projects.get(item.project_id);
    if (!project) {
      return failure(`Project not found: ${item.project_id}`);
    }

    const allItems = deps.planItems.getByProject(project.id);
    const children = allItems.filter((candidate) => candidate.parent_id === planItemId);
    const parent = item.parent_id ? deps.planItems.get(item.parent_id) ?? null : null;

    return success({
      item,
      project,
      children,
      parent,
    });
  }

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
      const sessions = deps.devSessions.getByProjectWithPlanItems(projectId);
      const latestReviewBySessionId = new Map(
        latestReviews.map((review) => [review.implementation_session_id, review])
      );

      return sessions.map((session) => ({
        ...session,
        latest_agent_review: latestReviewBySessionId.get(session.id) ?? null,
      }));
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

    updateAutomationPhase(sessionId: string, phase: DevSession['automation_phase']): void {
      deps.devSessions.updateAutomationPhase(sessionId, phase);
      const updatedSession = deps.devSessions.get(sessionId);
      if (updatedSession) {
        broadcastSessionStatusChange(updatedSession);
      }
    },

    markLatestAgentReviewStale(sessionId: string): void {
      deps.agentReviews.markLatestCompletedStale(sessionId);
    },

    /**
     * Check if a plan item has an active session
     */
    hasActiveSession(planItemId: string): boolean {
      return !!deps.devSessions.getActiveByPlanItem(planItemId);
    },

    /**
     * Get the most recent session for a plan item, regardless of status.
     * Used by board execution to continue previous work instead of silently
     * creating a brand new session/worktree.
     */
    getLatestSessionForPlanItem(planItemId: string): DevSession | undefined {
      return deps.devSessions.getByPlanItem(planItemId);
    },

    /**
     * Build the structured prompt used when a board action starts a session.
     * This keeps board launches aligned with the richer plan-item execution path.
     */
    buildBoardStartInstructions(
      planItemId: string,
      userPrompt?: string
    ): ServiceResult<string> {
      const contextResult = getAgentContextInput(planItemId);
      if (!contextResult.ok) {
        return contextResult;
      }

      return success(buildBoardStartInstructions({
        ...contextResult.data,
        userPrompt,
      }));
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

        // Use provided base branch or detect the default
        const baseBranch = options?.baseBranch ?? await detectDefaultBranch(repo.path);

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
          name: item.title,
          worktree_path: worktreePath,
          branch_name: branchName,
          base_branch: baseBranch,
          status: 'pending',
          agent_type: 'claude',
          automation_phase: null,
          initial_instructions: instructions,
          pr_number: null,
          pr_url: null,
          pr_state: null,
          review_state: null,
          merge_order: null,
        });

        // Broadcast new session to UI
        broadcastSessionStatusChange(session);

        return success(session);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    /**
     * Start a session using the Agent SDK (no PTY).
     * Used by the board-driven execution flow.
     * Creates worktree, builds prompt, then delegates to AgentSessionManager.
     */
    async startAgentSession(
      sessionId: string,
    ): AsyncResult<{ session: DevSession }> {
      try {
        if (!deps.agentSessionManager) {
          return failure('Agent session manager is not available');
        }

        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }

        if (session.status !== 'pending' && session.status !== 'inactive') {
          return failure(`Session is not in a startable state: ${session.status}`);
        }

        const repo = deps.repos.getById(session.repo_id);
        if (!repo) {
          return failure(`Repository not found: ${session.repo_id}`);
        }

        // Create worktree directory (if needed) and git worktree
        const scaffoldResult = await _scaffoldWorktree({
          worktreePath: session.worktree_path,
          branchName: session.branch_name,
          baseBranch: session.base_branch,
          repoPath: repo.path,
        });
        if (!scaffoldResult.ok) {
          if (scaffoldResult.kind === 'checkedOutInMainRepo') {
            return failure(
              `Branch '${session.branch_name}' is currently checked out in the main repository. ` +
              `Switch to a different branch or choose a different branch for this session.`
            );
          }
          if (scaffoldResult.kind === 'checkedOutElsewhere') {
            return failure(
              `Branch '${session.branch_name}' is already checked out in another worktree.`
            );
          }
          return failure(`Failed to create worktree: ${scaffoldResult.innerMessage}`);
        }

        // Use the user's prompt override if provided, otherwise the stored instructions

        deps.agentReviews.markLatestCompletedStale(sessionId);
        deps.devSessions.updateAutomationPhase(sessionId, 'idle');


        // Build SDK options for the dev session
        const sdkOptions: SDKOptions = {
          model: developerModel,
          maxTurns: getConfig().claude.maxTurns,
          permissionMode: getConfig().claude.defaultPermissionMode,
          thinking: { type: 'adaptive' as const, display: 'summarized' as const },
          ...getClaudeSdkSpawnOptions(),
        };

        // Create the agent session via the manager
        const agentSession = deps.agentSessionManager.create({
          devSessionId: sessionId,
          projectId: session.project_id,
          agentType: session.agent_type,
          role: 'implement',
          sdkOptions: session.agent_type === 'claude' ? sdkOptions : undefined,
        });

        // Update DB status to active
        deps.devSessions.updateStatus(sessionId, 'active');
        const updatedSession = deps.devSessions.get(sessionId)!;
        broadcastSessionStatusChange(updatedSession);

        // Start the agent session asynchronously
          console.error(`[DevSessionService] Agent session start failed for ${sessionId}:`, error);
          deps.devSessions.updateStatus(sessionId, 'inactive');
          const failedSession = deps.devSessions.get(sessionId);
          if (failedSession) {
            broadcastSessionStatusChange(failedSession);
          }
        });

        return success({ session: updatedSession });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    async sendAgentFollowUp(
      sessionId: string,
      text: string,
      try {
        if (!deps.agentSessionManager) {
          return failure('Agent session manager is not available');
        }

        const activeSession = deps.agentSessionManager.getByDevSession(sessionId);
        if (activeSession) {
          deps.agentReviews.markLatestCompletedStale(sessionId);
          try {
            await activeSession.followUp(text);
            return success({ restarted: false });
          } catch (followUpError) {
            // followUp() rejects when the session is in a non-terminal state (e.g. 'working').
            // This can happen if the session was resumed externally. Fall through to restart.
            console.warn(`[DevSessionService] followUp() failed for ${sessionId}, will restart:`, followUpError);
          }
        }

        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }

        if (session.status === 'active') {
          deps.devSessions.updateStatus(sessionId, 'inactive');
        }

        const restartPrompt = [
          'Resume work on this existing implementation task.',
          '',
          'Original task:',
          session.initial_instructions || 'No original task description was stored.',
          '',
          'Follow-up request:',
          text,
        ].join('\n');

        const startResult = await service.startAgentSession(sessionId, { prompt: restartPrompt });
        if (!startResult.ok) {
          return failure(startResult.error);
        }

        return success({ restarted: true });
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
     * Commit uncommitted changes in the session's worktree.
     *
     * Stages all changes and commits once. If pre-commit hooks rewrite files
     * and exit non-zero (prettier/eslint/lefthook pattern), re-stages and
     * retries once — mirrors the /commit skill's conversational retry.
     */
    async commitSessionChanges(
      sessionId: string,
      message: string,
    ): AsyncResult<{ sha: string }> {
      const session = deps.devSessions.get(sessionId);
      if (!session) {
        return failure(`Session not found: ${sessionId}`);
      }

      const extractSha = (stdout: string): string => {
        const shaMatch = /\[[\w/.-]+ ([0-9a-f]{7,})\]/.exec(stdout);
        return shaMatch?.[1] ?? '';
      };

      const isNothingToCommit = (err: unknown): boolean => {
        const stderr = (err as { stderr?: string }).stderr ?? '';
        const stdout = (err as { stdout?: string }).stdout ?? '';
        return stderr.includes('nothing to commit') || stdout.includes('nothing to commit');
      };

      try {
        await gitExec(['add', '-A'], { cwd });
        try {
          const { stdout } = await gitExec(['commit', '-m', message], { cwd });
          return success({ sha: extractSha(stdout) });
        } catch (firstErr) {
          if (isNothingToCommit(firstErr)) {
            return failure('Nothing to commit — working tree is clean');
          }
        }
      } catch (err) {
        if (isNothingToCommit(err)) {
          return failure('Nothing to commit — working tree is clean');
        }
      }
    },

    /**
     * Get the commit log (commits ahead of base branch) for a session's worktree.
     */
    async getSessionCommitLog(
      sessionId: string,
    ): AsyncResult<{ sha: string; subject: string; authorName: string; date: string }[]> {
      try {
        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }
        if (!fs.existsSync(session.worktree_path)) {
          return success([]);
        }

        const SEP = '\x1f';
        const { stdout } = await gitExec(
          { cwd: session.worktree_path },
        );

        const commits = stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [sha, subject, authorName, date] = line.split(SEP);
            return {
              sha: sha ?? '',
              subject: subject ?? '',
              authorName: authorName ?? '',
              date: date ?? '',
            };
          });

        return success(commits);
      } catch (err) {
        return failure(err instanceof Error ? err.message : String(err));
      }
    },

    /**
     * Get per-file additions/deletions for a single commit in a session's worktree.
     */
    async getSessionCommitFiles(
      sessionId: string,
      sha: string,
    ): AsyncResult<{ additions: number; deletions: number; path: string }[]> {
      try {
        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }
        if (!fs.existsSync(session.worktree_path)) {
          return success([]);
        }

        const { stdout } = await gitExec(
          ['show', '--numstat', '--format=', sha],
          { cwd: session.worktree_path },
        );

        const files = stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const parts = line.split('\t');
            return {
              additions: parseInt(parts[0] ?? '0', 10) || 0,
              deletions: parseInt(parts[1] ?? '0', 10) || 0,
              path: parts[2] ?? '',
            };
          })
          .filter((f) => f.path);

        return success(files);
      } catch (err) {
        return failure(err instanceof Error ? err.message : String(err));
      }
    },

    /**
     * Update session name
     */
    updateName(sessionId: string, name: string): void {
      deps.devSessions.updateName(sessionId, name);
    },

    /**
     * Update user-explicit merge order override (null = derive from plan graph)
     */
    updateMergeOrder(sessionId: string, order: number | null): void {
      deps.devSessions.updateMergeOrder(sessionId, order);
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
