/**
 * AgentSessionManager - Factory + registry for agent sessions.
 *
 * Creates agent sessions (Claude SDK, Codex SDK, Pi SDK, or CLI), tracks active sessions per project,
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
  AgentTurnResult,
  ReviewFinding,
  IAgentSession,
} from '../../../shared/agent-types';
import { isAgentActive, isAgentTerminal, toImplSessionId } from '../../../shared/agent-types';
import { ClaudeSdkSession } from './ClaudeSdkSession';
import { CliAgentSession } from './CliAgentSession';
import { CodexSdkAgentSession } from './CodexSdkAgentSession';
import { PiSdkAgentSession } from './PiSdkAgentSession';
import type { HookEvent } from './hookServer';
import { getConfig } from '../../config';
import { emitAppEvent, type EventDefinition, type EventPayload } from '../../../shared/ipc/appEvents';
import { agentSessionEvents } from '../../../shared/ipc/agentSessionEvents';
import type { AgentEffortLevel } from '../../../shared/types';

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
    stepId?: string;
    runIndex?: number;
  }) => void | Promise<void>;
  persistReviewResult?: (result: {
    implementationSessionId: string;
    reviewSessionId: string;
    reviewerAgent: AgentType;
    findings: ReviewFinding[];
    rawOutput: string | null;
    stepId?: string;
    runIndex?: number;
  }) => void | Promise<void>;
  persistReviewFailure?: (result: {
    implementationSessionId: string;
    reviewSessionId: string;
    reviewerAgent: AgentType;
    rawOutput: string | null;
    error: string;
    stepId?: string;
    runIndex?: number;
  }) => void | Promise<void>;
  onSessionComplete?: (event: {
    devSessionId: string;
    implementationSessionId: string;
    stepId?: string;
    runIndex?: number;
    role: AgentSessionRole;
    summary: AgentCompletionSummary;
    findings?: ReviewFinding[];
    reviewError?: string;
    finalText?: string | null;
  }) => void | Promise<void>;
  onSessionStateChange?: (event: {
    devSessionId: string;
    implementationSessionId: string;
    stepId?: string;
    runIndex?: number;
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
    implementationSessionId: string;
    projectId: string;
    role: AgentSessionRole;
    usage: AgentSessionUsage;
    stepId?: string;
    runIndex?: number;
  }) => void;
}

interface TrackedSession {
  agentSession: IAgentSession;
  devSessionId: string;
  implementationSessionId: string;
  projectId: string;
  stepId?: string;
  runIndex?: number;
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
  /** Model override for agent sessions (a Codex model id, or a '<provider>/<model>' selector for Pi) */
  model?: string;
  /** Provider-neutral role instructions used by Pi board sessions. */
  systemPrompt?: string;
  effort?: AgentEffortLevel;
  expectsFindings?: boolean;
  readOnly?: boolean;
  implementationSessionId?: string;
  stepId?: string;
  runIndex?: number;
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

    let agentSession: IAgentSession;

    if (agentType === 'claude') {
      if (!sdkOptions) {
        throw new Error('SDK options are required for Claude agent sessions');
      }
      agentSession = new ClaudeSdkSession({
        id: devSessionId,
        role,
        sdkOptions,
        expectsFindings: params.expectsFindings,
        readOnly: params.readOnly,
      });
    } else if (agentType === 'codex') {
      agentSession = new CodexSdkAgentSession({
        id: devSessionId,
        role,
        model,
        effort: params.effort,
        expectsFindings: params.expectsFindings,
        readOnly: params.readOnly,
      });
    } else if (agentType === 'pi') {
      agentSession = new PiSdkAgentSession({
        id: devSessionId,
        role,
        model,
        systemPrompt: params.systemPrompt ?? '',
        effort: params.effort,
        expectsFindings: params.expectsFindings,
        readOnly: params.readOnly,
      });
    } else {
      // Gemini/legacy Claude CLI — use PTY + hooks session
      if (!hookPort) {
        throw new Error('Hook server is not running — cannot start CLI agent session');
      }
      agentSession = new CliAgentSession({
        id: devSessionId,
        agentType,
        role,
        hookPort,
        expectsFindings: params.expectsFindings,
      });
    }

    // Register session
    const tracked: TrackedSession = {
      agentSession,
      devSessionId,
      implementationSessionId: params.implementationSessionId
        ?? (role === 'review' ? toImplSessionId(devSessionId) : devSessionId),
      projectId,
      stepId: params.stepId,
      runIndex: params.runIndex,
    };
    const existingTimer = terminalEvictionTimers.get(agentSession.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      terminalEvictionTimers.delete(agentSession.id);
    }
    const existingTracked = sessions.get(agentSession.id);
    existingTracked?.agentSession.clearHandlers();
    existingTracked?.agentSession.dispose?.();
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
      if (tracked.projectId === projectId && isAgentActive(tracked.agentSession.state)) {
        result.push(tracked.agentSession);
      }
    }
    return result;
  }

  function getActiveCountForProject(projectId: string): number {
    return getActiveForProject(projectId).length;
  }

  /**
   * Board agents working, and board agents blocked on the user, keyed by
   * project. Feeds the cross-project activity snapshot, so it counts every
   * project at once rather than taking one id.
   */
  function activityCountsByProject(): Map<string, { working: number; awaitingInput: number }> {
    const counts = new Map<string, { working: number; awaitingInput: number }>();
    for (const tracked of sessions.values()) {
      const state = tracked.agentSession.state;
      if (!isAgentActive(state)) continue;
      const entry = counts.get(tracked.projectId) ?? { working: 0, awaitingInput: 0 };
      if (state === 'waiting_for_input') entry.awaitingInput += 1;
      else entry.working += 1;
      counts.set(tracked.projectId, entry);
    }
    return counts;
  }

  /** Whether the session tracked for this dev session is still busy (starting/working/waiting_for_input). False if no session is registered. */
  function isSessionBusy(devSessionId: string): boolean {
    const session = getByDevSession(devSessionId);
    return session !== undefined && isAgentActive(session.state);
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
    tracked.agentSession.dispose?.();
    console.log(`${LOG_PREFIX} Removed session ${sessionId}`);
  }

  async function stopForImplementationSession(implementationSessionId: string): Promise<boolean> {
    const matching = [...sessions.values()].filter((tracked) =>
      tracked.implementationSessionId === implementationSessionId && isAgentActive(tracked.agentSession.state),
    );
    if (matching.length === 0) return false;
    await Promise.allSettled(matching.map((tracked) => tracked.agentSession.stop()));
    return true;
  }

  /** Stop and remove all sessions (e.g., on app quit) */
  async function stopAll(): Promise<void> {
    const allTracked = Array.from(sessions.values());
    const allActive = allTracked
      .filter(t => isAgentActive(t.agentSession.state))
      .map(t => t.agentSession);
    await Promise.allSettled(allActive.map(s => s.stop()));
    for (const tracked of allTracked) {
      tracked.agentSession.clearHandlers();
      tracked.agentSession.dispose?.();
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
          implementationSessionId: tracked.implementationSessionId,
          ...getStepContext(tracked),
          role: agentSession.role,
          state,
        })
      ).catch((error) => {
        console.error(`${LOG_PREFIX} Session state change hook failed for ${devSessionId}:`, error);
      });

      broadcast(agentSessionEvents.stateChanged, {
        sessionId: agentSession.id,
        devSessionId,
        state,
        implementationSessionId: tracked.implementationSessionId,
        role: agentSession.role,
        ...getStepContext(tracked),
      });

      if (isAgentActive(state)) {
        const existingTimer = terminalEvictionTimers.get(agentSession.id);
        if (existingTimer) {
          clearTimeout(existingTimer);
          terminalEvictionTimers.delete(agentSession.id);
        }
      }

      if (isAgentTerminal(state)) {
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
          agentSession.dispose?.();
          console.log(`${LOG_PREFIX} Evicted terminal session ${agentSession.id} after TTL`);
        }, getConfig().agentSession.terminalSessionTtlMs);
        terminalEvictionTimers.set(agentSession.id, evictionTimer);
      }
    });

    agentSession.on('onActivity', (activity: AgentActivity) => {
      broadcast(agentSessionEvents.activity, {
        sessionId: agentSession.id,
        devSessionId,
        activity,
        implementationSessionId: tracked.implementationSessionId,
        role: agentSession.role,
        ...getStepContext(tracked),
      });
    });

    agentSession.on('onQuestion', (question: AgentQuestion) => {
      broadcast(agentSessionEvents.question, {
        sessionId: agentSession.id,
        devSessionId,
        question,
      });
    });

    agentSession.on('onUsage', (usage: AgentSessionUsage) => {
      try {
        deps.onSessionUsage?.({
          devSessionId,
          implementationSessionId: tracked.implementationSessionId,
          projectId: tracked.projectId,
          role: agentSession.role,
          usage,
          ...getStepContext(tracked),
        });
      } catch (error) {
        console.error(`${LOG_PREFIX} onSessionUsage hook failed for ${devSessionId}:`, error);
      }
    });

    agentSession.on('onComplete', (summary: AgentCompletionSummary) => {
      const result = agentSession.getResult();
      const findings = result.review && 'findings' in result.review ? result.review.findings : undefined;
      const reviewError = result.review && 'error' in result.review ? result.review.error : undefined;

      let reviewPersistence = Promise.resolve();
      if (agentSession.role === 'review' && findings) {
        const implementationSessionId = tracked.implementationSessionId;
        reviewPersistence = Promise.resolve(
          deps.persistReviewResult?.({
            implementationSessionId,
            reviewSessionId: devSessionId,
            reviewerAgent: agentSession.agentType,
            findings,
            rawOutput: result.reviewRawOutput ?? null,
            ...getStepContext(tracked),
          })
        ).catch((error) => {
          console.error(`${LOG_PREFIX} Failed to persist review result for ${devSessionId}:`, error);
        });
      } else if (agentSession.role === 'review' && reviewError) {
        reviewPersistence = persistReviewFailureOnce(agentSession, reviewError, result.reviewRawOutput ?? null);
        broadcast(agentSessionEvents.error, {
          sessionId: agentSession.id,
          devSessionId,
          error: reviewError,
          implementationSessionId: tracked.implementationSessionId,
          role: agentSession.role,
          ...getStepContext(tracked),
        });
      }

      broadcast(agentSessionEvents.complete, {
        sessionId: agentSession.id,
        devSessionId,
        role: agentSession.role,
        summary,
        findings,
        implementationSessionId: tracked.implementationSessionId,
        ...getStepContext(tracked),
      });

      // Fan-out settlement reconstructs from persisted review rows. Ensure this
      // concrete run is durable before the orchestrator observes completion.
      void reviewPersistence.then(() => deps.onSessionComplete?.({
        devSessionId,
        implementationSessionId: tracked.implementationSessionId,
        ...getStepContext(tracked),
        role: agentSession.role,
        summary,
        findings,
        reviewError,
        finalText: result.finalText,
      })).catch((error) => {
        console.error(`${LOG_PREFIX} Session completion hook failed for ${devSessionId}:`, error);
      });
    });

    agentSession.on('onError', (error: string) => {
      if (agentSession.role === 'review') {
        const result: AgentTurnResult = agentSession.getResult();
        void persistReviewFailureOnce(agentSession, error, result.reviewRawOutput ?? result.finalText ?? null);
      }

      broadcast(agentSessionEvents.error, {
        sessionId: agentSession.id,
        devSessionId,
        error,
        implementationSessionId: tracked.implementationSessionId,
        role: agentSession.role,
        ...getStepContext(tracked),
      });
    });
  }

  function broadcast<E extends EventDefinition>(event: E, payload: EventPayload<E>): void {
    const mainWindow = deps.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      emitAppEvent(mainWindow.webContents, event, payload);
    }
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  function getStepContext(tracked: Pick<TrackedSession, 'stepId' | 'runIndex'> | undefined): {
    stepId?: string;
    runIndex?: number;
  } {
    return {
      ...(tracked?.stepId !== undefined ? { stepId: tracked.stepId } : {}),
      ...(tracked?.runIndex !== undefined ? { runIndex: tracked.runIndex } : {}),
    };
  }

  function persistReviewStartedOnce(agentSession: IAgentSession): void {
    if (persistedReviewStartIds.has(agentSession.id)) {
      return;
    }

    persistedReviewStartIds.add(agentSession.id);
    const tracked = sessions.get(agentSession.id);
    void Promise.resolve(
      deps.persistReviewStarted?.({
        implementationSessionId: tracked?.implementationSessionId ?? toImplSessionId(agentSession.id),
        reviewSessionId: agentSession.id,
        reviewerAgent: agentSession.agentType,
        ...getStepContext(tracked),
      })
    ).catch((error) => {
      console.error(`${LOG_PREFIX} Failed to persist review start for ${agentSession.id}:`, error);
    });
  }

  function persistReviewFailureOnce(agentSession: IAgentSession, error: string, rawOutput: string | null): Promise<void> {
    if (persistedReviewFailureIds.has(agentSession.id)) {
      return Promise.resolve();
    }

    persistedReviewFailureIds.add(agentSession.id);
    const tracked = sessions.get(agentSession.id);
    return Promise.resolve(
      deps.persistReviewFailure?.({
        implementationSessionId: tracked?.implementationSessionId ?? toImplSessionId(agentSession.id),
        reviewSessionId: agentSession.id,
        reviewerAgent: agentSession.agentType,
        rawOutput,
        error,
        ...getStepContext(tracked),
      })
    ).catch((persistError) => {
      console.error(`${LOG_PREFIX} Failed to persist review failure for ${agentSession.id}:`, persistError);
    });
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Dispatch a hook event to the tracked session, if it accepts hook events.
   * Called by the hook server when it receives a POST. Hooks are a CLI-only
   * concept — sessions that don't implement `acceptHookEvent` silently ignore
   * this rather than the manager needing to know which backend that is.
   */
  function handleHookEvent(sessionId: string, hookEvent: HookEvent): void {
    const tracked = sessions.get(sessionId);
    if (!tracked) {
      console.warn(`${LOG_PREFIX} Hook event for unknown session: ${sessionId}`);
      return;
    }
    tracked.agentSession.acceptHookEvent?.(hookEvent);
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
    activityCountsByProject,
    isSessionBusy,
    stopForImplementationSession,
    remove,
    stopAll,
    handleHookEvent,
    setHookPort,
  };
}

/** Type inference for the manager instance */
export type AgentSessionManager = ReturnType<typeof createAgentSessionManager>;
