/**
 * Agent Session IPC handlers
 *
 * Handles renderer <-> main process communication for board-driven agent execution.
 */

import { runGeneration } from '../../generation';
import type { AgentSessionManager } from '../../services/agents/AgentSessionManager';
import type { DevSessionService } from '../../services/repo/DevSessionService';
import type { PromptOverrideService } from '../../services/core/PromptOverrideService';
import type { IAgentReviewRepository } from '../../db/interfaces';
import { getAvailableAgents } from '../../services/agents/agentCatalog';
import { readSessionRun } from '../../services/agents/sessionPlaybook';
import { unwrapOrThrow } from '../../services/result';
import { getConfig } from '../../config';
import { agentSessionEndpoints, type AgentSessionEndpointName } from '../../../shared/ipc/agentSessionEndpoints';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';
import { createRegistryIpcHandlers } from '../validation/utils';

/**
 * One handler per `agentSessionEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 *
 * `commit` is excluded from the `UnwrappedHandlerFor` mapping: unlike every
 * other entry, its handler returns the bare unwrapped data (`{sha}`) on
 * success but its OWN full `{success: false, ...}` envelope on failure
 * instead of throwing (see body below). `createRegistryIpcHandlers` spreads
 * whatever the handler returns over `{success: true}`, so on the failure
 * path the spread's `success: false` wins over the wrapper's `success: true`
 * — the wire result matches either way, but the handler's own return type
 * mixes unwrapped data and full-envelope shapes per branch, which no single
 * `HandlerFor`/`UnwrappedHandlerFor` mapping expresses; it's typed directly
 * against that mixed union instead.
 */
type AgentSessionHandlers = {
  [K in AgentSessionEndpointName]: K extends 'commit'
    ? (
        params: Parameters<UnwrappedHandlerFor<typeof agentSessionEndpoints, K>>[0],
        event: Electron.IpcMainInvokeEvent
      ) =>
        | { sha: string }
        | { success: false; error: string; repairStarted?: true }
        | Promise<{ sha: string } | { success: false; error: string; repairStarted?: true }>
    : UnwrappedHandlerFor<typeof agentSessionEndpoints, K>;
};

function assertInterpreterAllowsInteraction(devSessionService: DevSessionService, devSessionId: string): void {
  const persisted = devSessionService.get(devSessionId);
  if (persisted && readSessionRun(persisted).isLive) {
    throw new Error('Stop to interact');
  }
}

function buildAgentSessionHandlers(
  agentSessionManager: AgentSessionManager,
  devSessionService: DevSessionService,
  promptOverrideService: PromptOverrideService,
  agentReviews: Pick<IAgentReviewRepository, 'listByImplementationSessionId'>,
): AgentSessionHandlers {
  return {
    // Create pending session + start agent in one atomic call.
    // Primary entry point from the board UI (play button / drag-to-start).
    createAndStart: async (params) => {
      const result = await devSessionService.createAndStartFromBoard(params);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return { session: result.data.session };
    },

    // Start an agent session for an existing pending/inactive dev session
    startAgent: async ({ devSessionId }) => {
      const persisted = devSessionService.get(devSessionId);
      // The direct start fallback is retained only for pre-migration sessions
      // that have no snapshot. Every newly created row is snapshotted and uses
      // interpreter resume/dispatch semantics.
      const result = persisted && readSessionRun(persisted).isResumable
        ? await devSessionService.resumePlaybook(devSessionId)
        : await devSessionService.startAgentSession(devSessionId);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return { session: result.data.session };
    },

    resumePlaybook: async ({ devSessionId, note, action }) => {
      const result = await devSessionService.resumePlaybook(devSessionId, { note, action });
      if (!result.ok) throw new Error(result.error);
      return { session: result.data.session };
    },

    respond: async ({ devSessionId, text }) => {
      assertInterpreterAllowsInteraction(devSessionService, devSessionId);
      const session = agentSessionManager.getByDevSession(devSessionId);
      if (!session) {
        throw new Error(`No active agent session for dev session ${devSessionId}`);
      }
      await session.respond(text);
    },

    followUp: async ({ devSessionId, text }) => {
      assertInterpreterAllowsInteraction(devSessionService, devSessionId);
      const result = await devSessionService.sendAgentFollowUp(devSessionId, text);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },

    stop: async ({ devSessionId }) => {
      const session = agentSessionManager.getByDevSession(devSessionId);
      if (session) {
        await session.stop();
        return;
      }
      if (!await agentSessionManager.stopForImplementationSession(devSessionId)) {
        throw new Error(`No active agent session for dev session ${devSessionId}`);
      }
    },

    getActivities: ({ devSessionId }) => {
      const session = agentSessionManager.getByDevSession(devSessionId);
      if (!session) {
        return { activities: [] };
      }
      return { activities: session.activities };
    },

    listReviewHistory: ({ devSessionId }) => ({
      reviews: agentReviews.listByImplementationSessionId(devSessionId),
    }),

    getState: ({ devSessionId }) => {
      const session = agentSessionManager.getByDevSession(devSessionId);
      return { state: session?.state ?? null };
    },

    getAvailableAgents: async () => {
      const agents = await getAvailableAgents();
      return { agents };
    },

    // The board's "Run review" action, used when the automated post-implementation
    // review was skipped (e.g. Codex unavailable at the time) or needs re-running.
    launchReview: async ({ devSessionId }) => {
      return unwrapOrThrow(await devSessionService.runAdHocReview(devSessionId));
    },

    // Generate a commit message for the agent session's changes using configured instructions
    generateCommitMessage: async ({ devSessionId, taskTitle, externalKey }) => {
      const session = devSessionService.get(devSessionId);
      if (!session) {
        throw new Error(`Session not found: ${devSessionId}`);
      }

      const instructionsResult = promptOverrideService.getContent('generation.commit_message_instructions');
      const instructions = instructionsResult.ok ? instructionsResult.data : '';

      // Ground the message in the actual worktree diff (the same diff the
      // Changes tab shows). Passing only summary stats left the model with
      // nothing concrete to describe — it would refuse with "I don't see any
      // changes, run git diff" when the stat was momentarily absent.
      const diffResult = await devSessionService.getSessionDiff(devSessionId);
      const rawDiff = diffResult.ok ? diffResult.data.trim() : '';
      const MAX_DIFF_CHARS = 16000;
      const diff = rawDiff.length > MAX_DIFF_CHARS
        ? `${rawDiff.slice(0, MAX_DIFF_CHARS)}\n\n…(diff truncated)`
        : rawDiff;

      const contextLines: string[] = [`Task: ${taskTitle}`];
      if (externalKey) {
        contextLines.push(`Ticket key: ${externalKey}`);
      }

      const diffSection = diff
        ? `\n\nDiff (staged + unstaged vs HEAD):\n\`\`\`diff\n${diff}\n\`\`\``
        : '';

      const prompt = `Generate a git commit message for these changes:\n\n${contextLines.join('\n')}${diffSection}\n\n${instructions}`;

      const result = await runGeneration({
        purpose: 'commit_message',
        tier: 'cheap',
        systemPrompt:
          'You generate descriptive git commit messages. Return only the commit message — no explanation, no code fences.',
        prompt,
        timeoutMs: getConfig().generation.prGenerationTimeoutMs,
        timeoutMessage: 'Commit message generation timed out',
        projectId: session.project_id,
      });

      return { message: result.text.trim() };
    },

    // Commit uncommitted changes in the session's worktree
    commit: async ({ devSessionId, message, repairOnFailure }) => {
      const result = await devSessionService.commitSessionChanges(devSessionId, message);
      if (!result.ok) {
        if (/nothing to commit/i.test(result.error)) {
          devSessionService.clearManualCommitInterruption(devSessionId);
        }
        if (repairOnFailure && !/nothing to commit/i.test(result.error)) {
          const repairResult = await devSessionService.requestCommitHookRepair(devSessionId, result.error);
          if (repairResult.ok && repairResult.data.started) {
            return {
              success: false as const,
              error: result.error,
              repairStarted: true,
            };
          }
          if (repairResult.ok && repairResult.data.alreadyAttempted) {
            return {
              success: false as const,
              error: result.error,
            };
          }
          return {
            success: false as const,
            error: repairResult.ok ? result.error : repairResult.error,
          };
        }
        return { success: false as const, error: result.error };
      }
      devSessionService.clearManualCommitInterruption(devSessionId);
      return result.data;
    },

    // Get structured commit log for the session (commits ahead of base branch)
    getCommitLog: async ({ devSessionId }) => {
      const result = await devSessionService.getSessionCommitLog(devSessionId);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return { commits: result.data };
    },

    // Get file stats for a single commit (additions/deletions per file)
    getCommitFiles: async ({ devSessionId, sha }) => {
      const result = await devSessionService.getSessionCommitFiles(devSessionId, sha);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return { files: result.data };
    },

    // Dismiss an "Automation interrupted" banner without re-running or committing
    dismissInterruption: ({ devSessionId }) => {
      devSessionService.dismissAutomationInterruption(devSessionId);
    },
  };
}

/**
 * Register agent session IPC handlers
 */
export function registerAgentSessionHandlers(
  agentSessionManager: AgentSessionManager,
  devSessionService: DevSessionService,
  promptOverrideService: PromptOverrideService,
  agentReviews: Pick<IAgentReviewRepository, 'listByImplementationSessionId'>,
): void {
  createRegistryIpcHandlers(
    agentSessionEndpoints,
    buildAgentSessionHandlers(agentSessionManager, devSessionService, promptOverrideService, agentReviews),
    'Agent session operation failed'
  );
}
