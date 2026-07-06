/**
 * DevSessionService - Manages development sessions for plan item implementation
 *
 * Each session:
 * - Creates an isolated git worktree from master/main
 * - Starts an implementation agent through AgentSessionManager
 * - Tracks status (pending → active → inactive)
 * - Persists across app restarts
 *
 * This module owns session lifecycle (create/start/follow-up/delete/destroy)
 * and DB-backed state transitions. It composes three sibling modules rather
 * than containing their concerns inline:
 * - devSessionPrompt.ts — pure prompt/context text assembly, no I/O
 * - worktreeScaffold.ts — git worktree/branch creation and verification
 * - devSessionGitInspection.ts — diff/log/commit reads on a session's worktree
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { failure, success, type AsyncResult, type ServiceResult } from '../result';
import {
  isCommitHookRepairPhase,
  type DevSession,
  type DevSessionStatus,
  type DevSessionWithPlanItem,
  type AgentEffortLevel,
  type AgentExecutionMode,
  type AgentReviewPolicy,
  type RepoEnvironmentMode,
} from '../../../shared/types';
import { captureRepoEnvironment } from './EnvironmentService';
import type {
  IAppSettingsRepository,
  IAgentReviewRepository,
  IDevSessionRepository,
  IPlanItemRepository,
  IPlanRelationRepository,
  IProjectRepository,
  IRepoRepository,
} from '../../db/interfaces';
import { computeMergeOrder, type MergeOrderEntry } from './mergeOrder';
import type { Options as SDKOptions } from '@anthropic-ai/claude-agent-sdk';
import { getClaudeSdkSpawnOptions } from '../../claude/findClaude';
import { formatPlanRefSection } from '../../claude/contextRefs';
import { getConfig } from '../../config';
import { createStatusBroadcaster } from './rendererBroadcast';
import { devSessionEvents } from '../../../shared/ipc/devSessionEvents';
import { gitExec, resolveBaseSha } from './gitUtils';
import { openDirectoryInCodeEditor } from './editorLauncher';
import type { AgentSessionManager } from '../agents/AgentSessionManager';
import { FollowUpNotAllowedError } from '../agents/BaseAgentSession';
import type { AutomationPhaseMachine } from '../agents/automationPhaseMachine';
import {
  type AgentContextInput,
  buildAgentContext,
  buildProjectContextPrefix,
  buildBoardStartInstructions,
  buildCommitHookRepairPrompt,
  buildExecutionPrompt,
  buildBoardSdkSettings,
  resolveBoardEffort,
  resolveBoardModel,
} from './devSessionPrompt';
import {
  generateBranchName,
  getWorktreesDir,
  generateUniqueBranchName,
  detectDefaultBranch,
  scaffoldWorktree,
  assertSessionWorktreeCheckout,
} from './worktreeScaffold';
import {
  checkSessionDirty,
  getSessionDiff,
  getSessionCommitsAhead,
  commitSessionChanges,
  getSessionCommitLog,
  getSessionCommitFiles,
} from './devSessionGitInspection';

export type { AgentContextInput, BoardClaudeModel } from './devSessionPrompt';
export { buildAgentContext, buildProjectContextPrefix, buildBoardStartInstructions };

export interface DevSessionServiceDeps {
  devSessions: IDevSessionRepository;
  planItems: IPlanItemRepository;
  planRelations: IPlanRelationRepository;
  projects: IProjectRepository;
  repos: IRepoRepository;
  appSettings: IAppSettingsRepository;
  agentReviews: IAgentReviewRepository;
  userDataPath: string;
  /** Resolves configurable prompt content (override > registry default). */
  getPromptContent: (key: string) => string;
  /** Wraps attached context files for prepending to agent prompts. */
  buildContextPrefix: (projectId: string, contextPaths: string[]) => AsyncResult<string>;
  /** Reads the project-level context file (AGENTS.md/CLAUDE.md) for prepending to agent prompts. */
  readProjectContextFile: (projectId: string) => AsyncResult<{ content: string | null; filename?: string }>;
  /** Optional — when provided, dev sessions use the Agent SDK instead of PTY */
  agentSessionManager?: AgentSessionManager;
  /** Sole writer of `automation_phase` — see automationPhaseMachine.ts */
  phaseMachine: Pick<AutomationPhaseMachine, 'transition'>;
}
const broadcastSessionStatusChange = createStatusBroadcaster<DevSession, typeof devSessionEvents.statusChanged>(devSessionEvents.statusChanged);

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
      const sessionIds = sessions.map((session) => session.id);
      const latestReviews = deps.agentReviews.getLatestByImplementationSessionIds(sessionIds);
      const latestReviewBySessionId = new Map(
        latestReviews.map((review) => [review.implementation_session_id, review])
      );
      const reviewerAgentsBySessionId =
        deps.agentReviews.getReviewerAgentsByImplementationSessionIds(sessionIds);

      return sessions.map((session) => ({
        ...session,
        latest_agent_review: latestReviewBySessionId.get(session.id) ?? null,
        reviewer_agents_seen: reviewerAgentsBySessionId.get(session.id) ?? [],
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

    clearManualCommitInterruption(sessionId: string): void {
      deps.phaseMachine.transition(sessionId, { type: 'manualCommitResolved' });
    },

    /**
     * Acknowledge an "Automation interrupted" banner the user considers fine.
     * Only acts on `needs_attention` (the interrupted state) and returns the
     * session to `idle` — it does not re-run the agent or commit. The worktree
     * is left untouched, so any uncommitted manual work is preserved.
     */
    dismissAutomationInterruption(sessionId: string): void {
      deps.phaseMachine.transition(sessionId, { type: 'automationDismissed' });
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
     * Open a session's worktree in the user's code editor.
     */
    async openInEditor(sessionId: string): AsyncResult<void> {
      try {
        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }

        if (!session.worktree_path) {
          return failure('Session has no worktree path');
        }

        if (!fs.existsSync(session.worktree_path)) {
          return failure(`Worktree path does not exist: ${session.worktree_path}`);
        }

        await openDirectoryInCodeEditor(session.worktree_path);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
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
     * Compute the merge order for all sessions in a project from the plan
     * dependency graph (user overrides win over the computed layer).
     */
    getMergeOrder(projectId: string): Record<string, MergeOrderEntry> {
      const sessions = deps.devSessions.getByProject(projectId);
      const relations = deps.planRelations.getByProject(projectId);
      return Object.fromEntries(computeMergeOrder(sessions, relations));
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
     * Resolve any @plan/<uuid> tokens in agent launch prompts or attached
     * context files so board agents receive the referenced plan item state.
     */
    buildPlanRefSection(projectId: string, content: string): string {
      if (!content) return '';
      const items = deps.planItems.getByProject(projectId);
      return formatPlanRefSection(content, items);
    },

    /**
     * Board entry point: reuse the latest pending/inactive session for the
     * plan item (same repo) or create a new pending session, then start the
     * agent with the augmented prompt (context files + plan refs + instructions).
     */
    async createAndStartFromBoard(input: {
      planItemId: string;
      repoId: string;
      prompt?: string;
      baseBranch?: string;
      contextPaths?: string[];
      effort?: AgentEffortLevel;
      environmentMode?: RepoEnvironmentMode;
      executionMode?: AgentExecutionMode;
      reviewPolicy?: AgentReviewPolicy;
    }): AsyncResult<{ session: DevSession }> {
      const executionMode = input.executionMode ?? 'standard';
      const reviewPolicy = input.reviewPolicy ?? 'auto';
      const instructionsResult = service.buildBoardStartInstructions(input.planItemId, input.prompt);
      if (!instructionsResult.ok) {
        return instructionsResult;
      }
      const instructions = instructionsResult.data;

      let sessionId: string;
      let projectId: string;

      const existing = deps.devSessions.getByPlanItem(input.planItemId);
      if (
        existing?.repo_id === input.repoId
        && (existing.status === 'inactive' || existing.status === 'pending')
      ) {
        sessionId = existing.id;
        projectId = existing.project_id;
        deps.devSessions.updateWorkflowControls(sessionId, executionMode, reviewPolicy);
      } else {
        const createResult = await service.createPendingSession(
          input.planItemId,
          input.repoId,
          instructions,
          { baseBranch: input.baseBranch, executionMode, reviewPolicy },
        );
        if (!createResult.ok) {
          return createResult;
        }
        sessionId = createResult.data.id;
        projectId = createResult.data.project_id;
      }

      const projectContextResult = await deps.readProjectContextFile(projectId);
      const projectContextPrefix = buildProjectContextPrefix(
        projectContextResult.ok ? projectContextResult.data : null,
      );

      const prefixResult = input.contextPaths?.length
        ? await deps.buildContextPrefix(projectId, input.contextPaths)
        : null;
      const contextPrefix = prefixResult?.ok ? prefixResult.data : '';
      const baseAugmented = projectContextPrefix + contextPrefix + instructions;
      const augmentedPrompt = service.buildPlanRefSection(projectId, baseAugmented) + baseAugmented;

      return service.startAgentSession(sessionId, {
        prompt: augmentedPrompt,
        effort: input.effort,
        environmentMode: input.environmentMode,
        executionMode,
      });
    },

    /**
     * Create a pending session (awaiting user approval)
     */
    async createPendingSession(
      planItemId: string,
      repoId: string,
      instructions: string,
      options?: {
        freshStart?: boolean;
        baseBranch?: string;
        executionMode?: AgentExecutionMode;
        reviewPolicy?: AgentReviewPolicy;
      }
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
          // Captured once the worktree (and its fork point) actually exists,
          // in startAgentSession after scaffoldWorktree.
          base_sha: null,
          status: 'pending',
          agent_type: 'claude',
          execution_mode: options?.executionMode ?? 'standard',
          review_policy: options?.reviewPolicy ?? 'auto',
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
      options?: {
        prompt?: string;
        effort?: AgentEffortLevel;
        environmentMode?: RepoEnvironmentMode;
        executionMode?: AgentExecutionMode;
      },
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
        const scaffoldResult = await scaffoldWorktree({
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

        const worktreeGuard = await assertSessionWorktreeCheckout({
          session,
          repoPath: repo.path,
        });
        if (!worktreeGuard.ok) {
          return worktreeGuard;
        }
        const worktreeCwd = worktreeGuard.data.cwd;

        // Capture the immutable fork-point SHA once, now that the worktree
        // exists. Commit/diff views range against this so a task's "Changes"
        // reflect only its own work — never commits that landed on a moving
        // base ref (e.g. local main advancing while origin/main lags).
        if (!session.base_sha) {
          const baseSha = await resolveBaseSha(worktreeCwd, session.base_branch);
          if (baseSha) {
            deps.devSessions.updateBaseSha(sessionId, baseSha);
            session.base_sha = baseSha;
          }
        }

        // Capture repo environment (direnv / auto-detect) after worktree is ready
        const capturedEnv = await captureRepoEnvironment(
          options?.environmentMode ?? repo.environment_mode ?? 'auto',
          worktreeCwd,
        );

        // Use the user's prompt override if provided, otherwise the stored instructions
        const executionMode = options?.executionMode ?? session.execution_mode ?? 'standard';
        const prompt = buildExecutionPrompt(options?.prompt || session.initial_instructions, executionMode);

        deps.agentReviews.markLatestCompletedStale(sessionId);
        deps.phaseMachine.transition(sessionId, { type: 'sessionStarted' });

        const developerModel = resolveBoardModel(executionMode, session.agent_type);
        const effectiveEffort = resolveBoardEffort(developerModel, options?.effort, executionMode);
        const sdkSettings = buildBoardSdkSettings(executionMode, effectiveEffort);
        const disallowedTools = executionMode === 'workflow'
          ? ['AskUserQuestion']
          : ['AskUserQuestion', 'Workflow'];

        // Build SDK options for the dev session
        // Dev sessions use a minimal config — no KPM MCP server, no plan tools
        const sdkOptions: SDKOptions = {
          systemPrompt: deps.getPromptContent('agents.implementation_system'),
          model: developerModel,
          cwd: worktreeCwd,
          maxTurns: getConfig().claude.maxTurns,
          permissionMode: getConfig().claude.defaultPermissionMode,
          // Board agents are one-shot — never pause for the built-in
          // option-picker; the agent proceeds on assumptions instead.
          disallowedTools,
          settingSources: ['user'],
          settings: sdkSettings,
          skills: [],
          env: { ...process.env, ...capturedEnv, CLAUDE_AGENT_SDK_CLIENT_APP: 'kpm' },
          thinking: { type: 'adaptive' as const, display: 'summarized' as const },
          agentProgressSummaries: true,
          ...(effectiveEffort && { effort: effectiveEffort }),
          ...getClaudeSdkSpawnOptions(),
        };

        // Create the agent session via the manager
        const agentSession = deps.agentSessionManager.create({
          devSessionId: sessionId,
          projectId: session.project_id,
          agentType: session.agent_type,
          role: 'implement',
          sdkOptions: session.agent_type === 'claude' ? sdkOptions : undefined,
          model: session.agent_type === 'codex' ? getConfig().agentSession.codexModel : undefined,
        });

        // Update DB status to active
        deps.devSessions.updateStatus(sessionId, 'active');
        const updatedSession = deps.devSessions.get(sessionId)!;
        broadcastSessionStatusChange(updatedSession);

        // Start the agent session asynchronously
        agentSession.start(worktreeCwd, prompt).catch(async (error) => {
          console.error(`[DevSessionService] Agent session start failed for ${sessionId}:`, error);
          try {
            await agentSession.stop();
          } catch (stopError) {
            console.warn(`[DevSessionService] Failed to stop failed agent session ${sessionId}:`, stopError);
          } finally {
            deps.agentSessionManager?.remove(agentSession.id);
          }
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
      options?: { restartIfBusy?: boolean },
    ): AsyncResult<{ restarted: boolean; deferred?: boolean }> {
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
            if (options?.restartIfBusy === false && followUpError instanceof FollowUpNotAllowedError) {
              return success({ restarted: false, deferred: true });
            }
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

    async requestCommitHookRepair(
      sessionId: string,
      hookOutput: string,
    ): AsyncResult<{ started: boolean; alreadyAttempted: boolean }> {
      try {
        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }

        if (isCommitHookRepairPhase(session.automation_phase)) {
          deps.phaseMachine.transition(sessionId, {
            type: 'automationFailed',
            reason: 'commit-hook-repair-already-attempted',
          });
          return success({ started: false, alreadyAttempted: true });
        }

        deps.phaseMachine.transition(sessionId, { type: 'commitHookRepairStarted' });

        const followUpResult = await service.sendAgentFollowUp(
          sessionId,
          buildCommitHookRepairPrompt(hookOutput),
        );

        if (!followUpResult.ok) {
          deps.phaseMachine.transition(sessionId, { type: 'automationFailed', reason: 'follow-up-send-failed' });
          return failure(followUpResult.error);
        }

        return success({ started: true, alreadyAttempted: false });
      } catch (error) {
        deps.phaseMachine.transition(sessionId, { type: 'automationFailed', reason: 'commit-hook-repair-errored' });
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
      const session = deps.devSessions.get(sessionId);
      if (!session) {
        return failure(`Session not found: ${sessionId}`);
      }
      return checkSessionDirty(session);
    },

    /**
     * Delete a session (removes record, optionally cleans worktree).
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
      const session = deps.devSessions.get(sessionId);
      if (!session) {
        return failure(`Session not found: ${sessionId}`);
      }
      return getSessionDiff(session);
    },

    /**
     * Get commit count ahead of base branch
     */
    async getCommitsAhead(sessionId: string): AsyncResult<number> {
      const session = deps.devSessions.get(sessionId);
      if (!session) {
        return failure(`Session not found: ${sessionId}`);
      }
      return getSessionCommitsAhead(session);
    },

    /**
     * Commit uncommitted changes in the session's worktree.
     */
    async commitSessionChanges(
      sessionId: string,
      message: string,
    ): AsyncResult<{ sha: string }> {
      const session = deps.devSessions.get(sessionId);
      if (!session) {
        return failure(`Session not found: ${sessionId}`);
      }
      const repo = deps.repos.getById(session.repo_id);
      if (!repo) {
        return failure(`Repository not found: ${session.repo_id}`);
      }
      return commitSessionChanges(session, repo.path, message);
    },

    /**
     * Get the commit log (commits ahead of base branch) for a session's worktree.
     */
    async getSessionCommitLog(
      sessionId: string,
    ): AsyncResult<{ sha: string; subject: string; authorName: string; date: string }[]> {
      const session = deps.devSessions.get(sessionId);
      if (!session) {
        return failure(`Session not found: ${sessionId}`);
      }
      return getSessionCommitLog(session);
    },

    /**
     * Get per-file additions/deletions for a single commit in a session's worktree.
     */
    async getSessionCommitFiles(
      sessionId: string,
      sha: string,
    ): AsyncResult<{ additions: number; deletions: number; path: string }[]> {
      const session = deps.devSessions.get(sessionId);
      if (!session) {
        return failure(`Session not found: ${sessionId}`);
      }
      return getSessionCommitFiles(session, sha);
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
