/**
 * Agent Session IPC handlers
 *
 * Handles renderer <-> main process communication for board-driven agent execution.
 */

import { ipcMain } from 'electron';
import type { AgentSessionManager } from '../../services/agents/AgentSessionManager';
import type { DevSessionService } from '../../services/repo/DevSessionService';
import type { PromptOverrideService } from '../../services/core/PromptOverrideService';
import { getAvailableAgents } from '../../services/agents/agentCatalog';
import { launchAutoReview } from '../../services/agents/autoReview';
import { AgentSessionSchemas, createIpcHandler, createSimpleIpcHandler } from '../validation';
import { IPC_CHANNELS } from '../channels';
import { getConfig } from '../../config';
import { getClaudeSdkSpawnOptions } from '../../claude/findClaude';

/**
 * Register agent session IPC handlers
 */
export function registerAgentSessionHandlers(
  agentSessionManager: AgentSessionManager,
  devSessionService: DevSessionService,
  promptOverrideService: PromptOverrideService,
): void {
  // Create pending session + start agent in one atomic call
  // This is the primary entry point from the board UI (play button / drag-to-start)
  ipcMain.handle(
    IPC_CHANNELS.agentSession.createAndStart,
    createIpcHandler(
      AgentSessionSchemas.createAndStart,
        }
      },
      'Failed to create and start agent session'
    )
  );

  // Start an agent session for an existing pending/inactive dev session
  ipcMain.handle(
    IPC_CHANNELS.agentSession.startAgent,
    createIpcHandler(
      AgentSessionSchemas.start,
      async ({ devSessionId }) => {
        const result = await devSessionService.startAgentSession(devSessionId);
        if (!result.ok) {
          throw new Error(result.error);
        }
        return { session: result.data.session };
      },
      'Failed to start agent session'
    )
  );

  // Respond to an agent's question
  ipcMain.handle(
    IPC_CHANNELS.agentSession.respond,
    createIpcHandler(
      AgentSessionSchemas.respond,
      async ({ devSessionId, text }) => {
        const session = agentSessionManager.getByDevSession(devSessionId);
        if (!session) {
          throw new Error(`No active agent session for dev session ${devSessionId}`);
        }
        await session.respond(text);
      },
      'Failed to respond to agent'
    )
  );

  // Follow up after agent completion
  ipcMain.handle(
    IPC_CHANNELS.agentSession.followUp,
    createIpcHandler(
      AgentSessionSchemas.followUp,
      async ({ devSessionId, text }) => {
        const result = await devSessionService.sendAgentFollowUp(devSessionId, text);
        if (!result.ok) {
          throw new Error(result.error);
        }

        return result.data;
      },
      'Failed to send follow-up to agent'
    )
  );

  // Stop an agent session
  ipcMain.handle(
    IPC_CHANNELS.agentSession.stop,
    createIpcHandler(
      AgentSessionSchemas.stop,
      async ({ devSessionId }) => {
        const session = agentSessionManager.getByDevSession(devSessionId);
        if (!session) {
          throw new Error(`No active agent session for dev session ${devSessionId}`);
        }
        await session.stop();
      },
      'Failed to stop agent session'
    )
  );

  // Get activities for a session
  ipcMain.handle(
    IPC_CHANNELS.agentSession.getActivities,
    createIpcHandler(
      AgentSessionSchemas.getActivities,
      ({ devSessionId }) => {
        const session = agentSessionManager.getByDevSession(devSessionId);
        if (!session) {
          return { activities: [] };
        }
        return { activities: session.activities };
      },
      'Failed to get agent activities'
    )
  );

  // Get current state for a session
  ipcMain.handle(
    IPC_CHANNELS.agentSession.getState,
    createIpcHandler(
      AgentSessionSchemas.getState,
      ({ devSessionId }) => {
        const session = agentSessionManager.getByDevSession(devSessionId);
        return { state: session?.state ?? null };
      },
      'Failed to get agent state'
    )
  );

  // Get available agents on this machine
  ipcMain.handle(
    IPC_CHANNELS.agentSession.getAvailableAgents,
    createSimpleIpcHandler(
      async () => {
        const agents = await getAvailableAgents();
        return { agents };
      },
      'Failed to detect available agents'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.agentSession.launchReview,
    createIpcHandler(
      AgentSessionSchemas.start, // Reuse start schema (takes devSessionId)
      async ({ devSessionId }) => {
        const session = devSessionService.get(devSessionId);
        if (!session) {
          throw new Error(`Session not found: ${devSessionId}`);
        }


      },
      'Failed to launch auto-review'
    )
  );

  // Generate a commit message for the agent session's changes using configured instructions
  ipcMain.handle(
    IPC_CHANNELS.agentSession.generateCommitMessage,
    createIpcHandler(
      AgentSessionSchemas.generateCommitMessage,
        const session = devSessionService.get(devSessionId);
        if (!session) {
          throw new Error(`Session not found: ${devSessionId}`);
        }

        const instructionsResult = promptOverrideService.getContent('generation.commit_message_instructions');
        const instructions = instructionsResult.ok ? instructionsResult.data : '';

        const contextLines: string[] = [`Task: ${taskTitle}`];
        if (externalKey) {
          contextLines.push(`Ticket key: ${externalKey}`);
        }


        const sdkOptions: SDKOptions = {
          model: getConfig().generation.cheapModel,
          allowedTools: [],
          persistSession: false,
          systemPrompt: 'You generate descriptive git commit messages. Return only the commit message — no explanation, no code fences.',
          stderr: () => {},
          ...getClaudeSdkSpawnOptions(),
        };

        const TIMEOUT_MS = getConfig().generation.prGenerationTimeoutMs;
      },
      'Failed to generate commit message'
    )
  );

  // Commit uncommitted changes in the session's worktree
  ipcMain.handle(
    IPC_CHANNELS.agentSession.commit,
    createIpcHandler(
      AgentSessionSchemas.commit,
        const result = await devSessionService.commitSessionChanges(devSessionId, message);
        if (!result.ok) {
        }
        return result.data;
      },
      'Failed to commit changes'
    )
  );

  // Get structured commit log for the session (commits ahead of base branch)
  ipcMain.handle(
    IPC_CHANNELS.agentSession.getCommitLog,
    createIpcHandler(
      AgentSessionSchemas.getCommitLog,
      async ({ devSessionId }) => {
        const result = await devSessionService.getSessionCommitLog(devSessionId);
        if (!result.ok) {
          throw new Error(result.error);
        }
        return { commits: result.data };
      },
      'Failed to get commit log'
    )
  );

  // Get file stats for a single commit (additions/deletions per file)
  ipcMain.handle(
    IPC_CHANNELS.agentSession.getCommitFiles,
    createIpcHandler(
      AgentSessionSchemas.getCommitFiles,
      async ({ devSessionId, sha }) => {
        const result = await devSessionService.getSessionCommitFiles(devSessionId, sha);
        if (!result.ok) {
          throw new Error(result.error);
        }
        return { files: result.data };
      },
      'Failed to get commit files'
    )
  );
}
