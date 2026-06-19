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
  AgentSessionUsage,
  ReviewFinding,
  IAgentSession,
} from '../../../shared/agent-types';
import { toImplSessionId } from '../../../shared/agent-types';
import { ClaudeSdkSession } from './ClaudeSdkSession';
import { CliAgentSession } from './CliAgentSession';
import type { HookEvent } from './hookServer';
import { parseReviewFindings } from './autoReview';
import { getConfig } from '../../config';

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
  persistReviewStarted?: (result: {
    implementationSessionId: string;
    reviewSessionId: string;
    reviewerAgent: AgentType;
  }) => void | Promise<void>;
  persistReviewResult?: (result: {
    implementationSessionId: string;
    reviewSessionId: string;
    reviewerAgent: AgentType;
    findings: ReviewFinding[];
    rawOutput: string | null;
  }) => void | Promise<void>;
  persistReviewFailure?: (result: {
    implementationSessionId: string;
    reviewSessionId: string;
    reviewerAgent: AgentType;
    rawOutput: string | null;
    error: string;
  }) => void | Promise<void>;
  onSessionComplete?: (event: {
    devSessionId: string;
    role: AgentSessionRole;
    summary: AgentCompletionSummary;
    findings?: ReviewFinding[];
    reviewError?: string;
  }) => void | Promise<void>;
  onSessionStateChange?: (event: {
    devSessionId: string;
    role: AgentSessionRole;
    state: AgentSessionState;
  }) => void | Promise<void>;
  /**
   * Hook for the centralized usage tracker. Fires once per turn for
   * Claude SDK sessions with billable usage. The manager forwards the
   * project + role context so the recorder can categorize the event.
   */
  onSessionUsage?: (event: {
    devSessionId: string;
    projectId: string;
    role: AgentSessionRole;
    usage: AgentSessionUsage;
  }) => void;
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
  model?: string;
}

// =============================================================================
// Factory
// =============================================================================

export function createAgentSessionManager(deps: AgentSessionManagerDeps) {
  /** Active sessions keyed by agent session ID */
  const sessions = new Map<string, TrackedSession>();
  const terminalEvictionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const persistedReviewStartIds = new Set<string>();
  const persistedReviewFailureIds = new Set<string>();
  let hookPort = deps.hookPort ?? 0;

  // ===========================================================================
  // Session Factory
  // ===========================================================================

  /**
   * Create and register a new agent session.
   * Does NOT start it — call agentSession.start() after creation.
   */
  function create(params: CreateSessionParams): IAgentSession {
    const { devSessionId, projectId, agentType, role, sdkOptions, model } = params;

    // Enforce concurrency limit
    const projectCount = getActiveCountForProject(projectId);
    const maxConcurrentSessions = getConfig().agentSession.maxConcurrentSessionsPerProject;
    if (projectCount >= maxConcurrentSessions) {
      throw new Error(
        `Maximum concurrent sessions (${maxConcurrentSessions}) reached for this project. ` +
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
        id: devSessionId,
        role,
        model,
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
    const existingTimer = terminalEvictionTimers.get(agentSession.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      terminalEvictionTimers.delete(agentSession.id);
    }
    const existingTracked = sessions.get(agentSession.id);
    existingTracked?.agentSession.clearHandlers();
    persistedReviewStartIds.delete(agentSession.id);
    persistedReviewFailureIds.delete(agentSession.id);
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
    const evictionTimer = terminalEvictionTimers.get(sessionId);
    if (evictionTimer) {
      clearTimeout(evictionTimer);
      terminalEvictionTimers.delete(sessionId);
    }
    persistedReviewStartIds.delete(sessionId);
    persistedReviewFailureIds.delete(sessionId);

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
    for (const timer of terminalEvictionTimers.values()) {
      clearTimeout(timer);
    }
    terminalEvictionTimers.clear();
    persistedReviewStartIds.clear();
    persistedReviewFailureIds.clear();
    sessions.clear();
  }

  // ===========================================================================
  // IPC Broadcasting
  // ===========================================================================

  function wireEventListeners(tracked: TrackedSession): void {
    const { agentSession, devSessionId } = tracked;

    agentSession.on('onStateChange', (state: AgentSessionState) => {
      if (agentSession.role === 'review' && state === 'working') {
        persistReviewStartedOnce(agentSession);
      }

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
        const existingTimer = terminalEvictionTimers.get(agentSession.id);
        if (existingTimer) clearTimeout(existingTimer);
        const evictionTimer = setTimeout(() => {
          terminalEvictionTimers.delete(agentSession.id);
          if (sessions.get(agentSession.id) === tracked) {
            sessions.delete(agentSession.id);
          }
          persistedReviewStartIds.delete(agentSession.id);
          persistedReviewFailureIds.delete(agentSession.id);
          // Drop every handler attached to the evicted session so captured IPC
          // callbacks don't hang on to the webContents reference for the full
          // runtime of the app. Keep this outside the identity check so an old
          // terminal session still releases handlers after a same-id restart.
          agentSession.clearHandlers();
          console.log(`${LOG_PREFIX} Evicted terminal session ${agentSession.id} after TTL`);
        }, getConfig().agentSession.terminalSessionTtlMs);
        terminalEvictionTimers.set(agentSession.id, evictionTimer);
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

    agentSession.on('onUsage', (usage: AgentSessionUsage) => {
      try {
        deps.onSessionUsage?.({
          devSessionId,
          projectId: tracked.projectId,
          role: agentSession.role,
          usage,
        });
      } catch (error) {
        console.error(`${LOG_PREFIX} onSessionUsage hook failed for ${devSessionId}:`, error);
      }
    });

    agentSession.on('onComplete', (summary: AgentCompletionSummary) => {
      const reviewOutput = agentSession.role === 'review'
        ? parseReviewOutput(agentSession)
        : null;
      const findings = reviewOutput?.findings;
      const reviewError = reviewOutput?.error;

      if (agentSession.role === 'review' && findings) {
        const implementationSessionId = toImplSessionId(devSessionId);
        void Promise.resolve(
          deps.persistReviewResult?.({
            implementationSessionId,
            reviewSessionId: devSessionId,
            reviewerAgent: agentSession.agentType,
            findings,
            rawOutput: reviewOutput.rawOutput,
          })
        ).catch((error) => {
          console.error(`${LOG_PREFIX} Failed to persist review result for ${devSessionId}:`, error);
        });
      } else if (agentSession.role === 'review' && reviewError) {
        persistReviewFailureOnce(agentSession, reviewError, reviewOutput?.rawOutput ?? null);
        broadcast('agent-session:error', {
          sessionId: agentSession.id,
          devSessionId,
          error: reviewError,
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
          reviewError,
        })
      ).catch((error) => {
        console.error(`${LOG_PREFIX} Session completion hook failed for ${devSessionId}:`, error);
      });
    });

    agentSession.on('onError', (error: string) => {
      if (agentSession.role === 'review') {
        persistReviewFailureOnce(agentSession, error, extractReviewOutput(agentSession));
      }

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

  function persistReviewStartedOnce(agentSession: IAgentSession): void {
    if (persistedReviewStartIds.has(agentSession.id)) {
      return;
    }

    persistedReviewStartIds.add(agentSession.id);
    void Promise.resolve(
      deps.persistReviewStarted?.({
        implementationSessionId: toImplSessionId(agentSession.id),
        reviewSessionId: agentSession.id,
        reviewerAgent: agentSession.agentType,
      })
    ).catch((error) => {
      console.error(`${LOG_PREFIX} Failed to persist review start for ${agentSession.id}:`, error);
    });
  }

  function persistReviewFailureOnce(agentSession: IAgentSession, error: string, rawOutput: string | null): void {
    if (persistedReviewFailureIds.has(agentSession.id)) {
      return;
    }

    persistedReviewFailureIds.add(agentSession.id);
    void Promise.resolve(
      deps.persistReviewFailure?.({
        implementationSessionId: toImplSessionId(agentSession.id),
        reviewSessionId: agentSession.id,
        reviewerAgent: agentSession.agentType,
        rawOutput,
        error,
      })
    ).catch((persistError) => {
      console.error(`${LOG_PREFIX} Failed to persist review failure for ${agentSession.id}:`, persistError);
    });
  }

  function parseReviewOutput(agentSession: IAgentSession): {
    findings?: ReviewFinding[];
    rawOutput: string | null;
    error?: string;
  } {
    const output = extractReviewOutput(agentSession);

    if (!output?.trim()) {
      return {
        rawOutput: output,
        error: 'Review agent completed without findings output',
      };
    }

    const findings = parseReviewFindings(output, agentSession.agentType);
    if (!findings) {
      return {
        rawOutput: output,
        error: 'Review agent returned output that did not match the required findings JSON schema',
      };
    }

    return { findings, rawOutput: output };
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
