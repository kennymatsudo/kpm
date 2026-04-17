/**
 * AgentSessionManager - Factory + registry for agent sessions.
 *
 * enforces concurrency limits, and broadcasts state changes to the renderer via IPC.
 */

import type { BrowserWindow } from 'electron';
import type { Options as SDKOptions } from '@anthropic-ai/claude-agent-sdk';
import type {
  AgentType,
  AgentSessionState,
  AgentSessionRole,
  AgentActivity,
  AgentQuestion,
  AgentCompletionSummary,
  ReviewFinding,
  IAgentSession,
} from '../../../shared/agent-types';
import { toImplSessionId } from '../../../shared/agent-types';
import { ClaudeSdkSession } from './ClaudeSdkSession';
import { CliAgentSession } from './CliAgentSession';
import type { HookEvent } from './hookServer';
import { parseReviewFindings } from './autoReview';

// =============================================================================
// Constants
// =============================================================================

const LOG_PREFIX = '[AgentSessionManager]';

// =============================================================================
// Types
// =============================================================================

export interface AgentSessionManagerDeps {
  getMainWindow: () => BrowserWindow | null;
  /** Hook server port for CLI agent sessions. 0 = hook server not started yet. */
  hookPort?: number;
  persistReviewResult?: (result: {
    implementationSessionId: string;
    reviewSessionId: string;
    reviewerAgent: AgentType;
    findings: ReviewFinding[];
    rawOutput: string | null;
  }) => void | Promise<void>;
  onSessionComplete?: (event: {
    devSessionId: string;
    role: AgentSessionRole;
    summary: AgentCompletionSummary;
    findings?: ReviewFinding[];
  }) => void | Promise<void>;
  onSessionStateChange?: (event: {
    devSessionId: string;
    role: AgentSessionRole;
    state: AgentSessionState;
  }) => void | Promise<void>;
}

interface TrackedSession {
  agentSession: IAgentSession;
  devSessionId: string;
  projectId: string;
}

export interface CreateSessionParams {
  /** The dev session ID this agent session is associated with */
  devSessionId: string;
  /** Project ID for concurrency tracking */
  projectId: string;
  /** Which agent to use */
  agentType: AgentType;
  /** Implementation or review */
  role: AgentSessionRole;
  /** SDK options (for Claude sessions) */
  sdkOptions?: SDKOptions;
}

// =============================================================================
// Factory
// =============================================================================

export function createAgentSessionManager(deps: AgentSessionManagerDeps) {
  /** Active sessions keyed by agent session ID */
  const sessions = new Map<string, TrackedSession>();
  let hookPort = deps.hookPort ?? 0;

  // ===========================================================================
  // Session Factory
  // ===========================================================================

  /**
   * Create and register a new agent session.
   * Does NOT start it — call agentSession.start() after creation.
   */
  function create(params: CreateSessionParams): IAgentSession {

    // Enforce concurrency limit
    const projectCount = getActiveCountForProject(projectId);
      throw new Error(
        'Stop an existing session before starting a new one.'
      );
    }

    let agentSession: IAgentSession;

    if (agentType === 'claude') {
      if (!sdkOptions) {
        throw new Error('SDK options are required for Claude agent sessions');
      }
      agentSession = new ClaudeSdkSession({
        id: devSessionId,
        role,
        sdkOptions,
      });
    } else {
      if (!hookPort) {
        throw new Error('Hook server is not running — cannot start CLI agent session');
      }
      agentSession = new CliAgentSession({
        id: devSessionId,
        agentType,
        role,
        hookPort,
      });
    }

    // Register session
    const tracked: TrackedSession = {
      agentSession,
      devSessionId,
      projectId,
    };
    sessions.set(agentSession.id, tracked);

    // Wire up event listeners for IPC broadcasting
    wireEventListeners(tracked);

    console.log(`${LOG_PREFIX} Created ${agentType} session ${agentSession.id} (${role}) for project ${projectId}`);

    return agentSession;
  }

  // ===========================================================================
  // Session Lookup
  // ===========================================================================

  function get(sessionId: string): IAgentSession | undefined {
    return sessions.get(sessionId)?.agentSession;
  }

  function getByDevSession(devSessionId: string): IAgentSession | undefined {
    for (const tracked of sessions.values()) {
      if (tracked.devSessionId === devSessionId) {
        return tracked.agentSession;
      }
    }
    return undefined;
  }

  function getActiveForProject(projectId: string): IAgentSession[] {
    const result: IAgentSession[] = [];
    for (const tracked of sessions.values()) {
      if (tracked.projectId === projectId && isActiveState(tracked.agentSession.state)) {
        result.push(tracked.agentSession);
      }
    }
    return result;
  }

  function getActiveCountForProject(projectId: string): number {
    return getActiveForProject(projectId).length;
  }

  // ===========================================================================
  // Session Cleanup
  // ===========================================================================

  function remove(sessionId: string): void {
    const tracked = sessions.get(sessionId);
    if (!tracked) return;

    sessions.delete(sessionId);
    tracked.agentSession.clearHandlers();
    console.log(`${LOG_PREFIX} Removed session ${sessionId}`);
  }

  /** Stop all sessions for a project (e.g., on project switch) */
  async function stopAllForProject(projectId: string): Promise<void> {
    const toStop = getActiveForProject(projectId);
    await Promise.allSettled(toStop.map(s => s.stop()));
  }

  /** Stop and remove all sessions (e.g., on app quit) */
  async function stopAll(): Promise<void> {
    const allTracked = Array.from(sessions.values());
    const allActive = allTracked
      .filter(t => isActiveState(t.agentSession.state))
      .map(t => t.agentSession);
    await Promise.allSettled(allActive.map(s => s.stop()));
    for (const tracked of allTracked) {
      tracked.agentSession.clearHandlers();
    }
    sessions.clear();
  }

  // ===========================================================================
  // IPC Broadcasting
  // ===========================================================================

  function wireEventListeners(tracked: TrackedSession): void {
    const { agentSession, devSessionId } = tracked;

    agentSession.on('onStateChange', (state: AgentSessionState) => {
      void Promise.resolve(
        deps.onSessionStateChange?.({
          devSessionId,
          role: agentSession.role,
          state,
        })
      ).catch((error) => {
        console.error(`${LOG_PREFIX} Session state change hook failed for ${devSessionId}:`, error);
      });

      broadcast('agent-session:state-changed', {
        sessionId: agentSession.id,
        devSessionId,
        state,
      });

      if (state === 'complete' || state === 'failed' || state === 'stopped') {
          // Drop every handler attached to the evicted session so captured IPC
          // callbacks don't hang on to the webContents reference for the full
          agentSession.clearHandlers();
          console.log(`${LOG_PREFIX} Evicted terminal session ${agentSession.id} after TTL`);
      }
    });

    agentSession.on('onActivity', (activity: AgentActivity) => {
      broadcast('agent-session:activity', {
        sessionId: agentSession.id,
        devSessionId,
        activity,
      });
    });

    agentSession.on('onQuestion', (question: AgentQuestion) => {
      broadcast('agent-session:question', {
        sessionId: agentSession.id,
        devSessionId,
        question,
      });
    });

    agentSession.on('onComplete', (summary: AgentCompletionSummary) => {

      if (agentSession.role === 'review' && findings) {
        const implementationSessionId = toImplSessionId(devSessionId);
        void Promise.resolve(
          deps.persistReviewResult?.({
            implementationSessionId,
            reviewSessionId: devSessionId,
            reviewerAgent: agentSession.agentType,
            findings,
          })
        ).catch((error) => {
          console.error(`${LOG_PREFIX} Failed to persist review result for ${devSessionId}:`, error);
        });
      }

      broadcast('agent-session:complete', {
        sessionId: agentSession.id,
        devSessionId,
        role: agentSession.role,
        summary,
        findings,
      });

      void Promise.resolve(
        deps.onSessionComplete?.({
          devSessionId,
          role: agentSession.role,
          summary,
          findings,
        })
      ).catch((error) => {
        console.error(`${LOG_PREFIX} Session completion hook failed for ${devSessionId}:`, error);
      });
    });

    agentSession.on('onError', (error: string) => {
      broadcast('agent-session:error', {
        sessionId: agentSession.id,
        devSessionId,
        error,
      });
    });
  }

  function broadcast(channel: string, payload: unknown): void {
    const mainWindow = deps.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  function isActiveState(state: AgentSessionState): boolean {
    return state === 'starting' || state === 'working' || state === 'waiting_for_input';
  }

    const output = extractReviewOutput(agentSession);

    if (!output?.trim()) {
    }

  }

  function extractReviewOutput(agentSession: IAgentSession): string | null {
    if (agentSession instanceof ClaudeSdkSession) {
      const latestMessage = [...agentSession.activities]
        .reverse()
        .find((activity) => activity.type === 'message' && typeof activity.content === 'string' && activity.content.trim().length > 0);
      return latestMessage?.content ?? null;
    }

    if (agentSession instanceof CliAgentSession) {
      return agentSession.getOutput() || null;
    }

    return null;
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Dispatch a hook event to the appropriate CLI agent session.
   * Called by the hook server when it receives a POST.
   */
  function handleHookEvent(sessionId: string, hookEvent: HookEvent): void {
    const tracked = sessions.get(sessionId);
    if (!tracked) {
      console.warn(`${LOG_PREFIX} Hook event for unknown session: ${sessionId}`);
      return;
    }
    if (tracked.agentSession instanceof CliAgentSession) {
      tracked.agentSession.handleHookEvent(hookEvent);
    }
  }

  /** Update the hook port (called after hook server starts) */
  function setHookPort(port: number): void {
    hookPort = port;
  }

  return {
    create,
    get,
    getByDevSession,
    getActiveForProject,
    getActiveCountForProject,
    remove,
    stopAllForProject,
    stopAll,
    handleHookEvent,
    setHookPort,
  };
}

/** Type inference for the manager instance */
export type AgentSessionManager = ReturnType<typeof createAgentSessionManager>;
