import type { PlanAction, SessionState } from '../../shared/types';
import type { ChatState } from '../stores/chat/types';
import { isStreamStale } from '../stores/chat/chatStreamReducer';
import type { StoreEvent } from '../stores/storeEvents';
import type {
  FileDeleteEventData,
  FileMoveEventData,
  FileUpdateEventData,
  PlanActionsEventData,
  ChunkEventData,
  SessionEventData,
  QueuedEventData,
  QueueClearedEventData,
  ErrorEventData,
  ActivityEventData,
  SessionReadyEventData,
  SessionTitleEventData,
  ThinkingEventData,
  SuggestionsEventData,
  SlashCommandsEventData,
  McpStatusEventData,
} from '../../shared/ipc/chatEvents';

/** Chat IPC event handlers in the shape `subscribeToChatEvents` accepts. */
export interface ChatEventHandlers {
  onChunk: (data: ChunkEventData) => void;
  onPlanActions: (data: PlanActionsEventData) => void;
  onFileUpdate: (data: FileUpdateEventData) => void;
  onFileMove: (data: FileMoveEventData) => void;
  onFileDelete: (data: FileDeleteEventData) => void;
  onDone: (data: SessionEventData) => void;
  onQueued: (data: QueuedEventData) => void;
  onQueueCleared: (data: QueueClearedEventData) => void;
  onError: (data: ErrorEventData) => void;
  onActivity: (data: ActivityEventData) => void;
  onThinking: (data: ThinkingEventData) => void;
  onSessionConnecting: (data: SessionEventData) => void;
  onSessionReady: (data: SessionReadyEventData) => void;
  onSessionTitle: (data: SessionTitleEventData) => void;
  onSessionError: (data: ErrorEventData) => void;
  onSuggestions: (data: SuggestionsEventData) => void;
  onSlashCommands: (data: SlashCommandsEventData) => void;
  onMcpStatus: (data: McpStatusEventData) => void;
  onSessionDeactivated: (data: SessionEventData) => void;
}

/** The slice of the chat store the router reads and drives. */
export type ChatStoreView = Pick<
  ChatState,
  | 'sessions'
  | 'viewedSessionId'
  | 'appendChunk'
  | 'appendThinking'
  | 'finalizeMessage'
  | 'setError'
  | 'setTokens'
  | 'addActivity'
  | 'updateActivity'
  | 'setSuggestions'
  | 'setSlashCommands'
  | 'setSessionState'
  | 'setRetrying'
  | 'markSessionActive'
  | 'markSessionInactive'
  | 'setViewedSession'
  | 'getOrCreateSession'
  | 'setClaudeSessionId'
  | 'setSessionTitle'
  | 'setMcpStatus'
  | 'setLastTurnUsage'
  | 'clearQueuedFlag'
  | 'removeQueuedUserMessage'
>;

export interface ApprovalQueueActions {
  processPlanActions: (projectId: string, actions: PlanAction[]) => void;
  processFileUpdate: (
    projectId: string,
    filePath: string,
    content: string,
    oldContent: string | null,
    options?: { forceReview?: boolean },
  ) => void;
  processFileMove: (projectId: string, sourcePath: string, targetPath: string) => void;
  processFileDelete: (projectId: string, filePath: string, isDirectory: boolean) => void;
}

export interface ChatEventRouterServices {
  getChatUsage: (projectId: string) => Promise<{ totalTokens: number }>;
  getActiveChatSessions: (projectId: string) => Promise<{
    success: boolean;
    sessions?: {
      chatSessionId: string;
      scope: string;
      state: SessionState;
      title?: string | null;
    }[];
  }>;
  getChatSessionState: (
    projectId: string,
    chatSessionId: string,
  ) => Promise<{ success: boolean; state?: SessionState }>;
}

export interface ChatEventRouterDeps {
  projectId: string;
  getChatState: () => ChatStoreView;
  getApprovalQueue: () => ApprovalQueueActions;
  services: ChatEventRouterServices;
  emitStoreEvent: (event: StoreEvent) => void;
  now: () => number;
  /** Cross-mount buffer for approval events targeting a non-active project. Defaults to the shared module buffer. */
  buffer?: Map<string, BufferedApprovalEvent[]>;
}

export type BufferedApprovalEvent =
  | { type: 'plan-actions'; data: PlanActionsEventData }
  | { type: 'file-update'; data: FileUpdateEventData }
  | { type: 'file-move'; data: FileMoveEventData }
  | { type: 'file-delete'; data: FileDeleteEventData };

/**
 * Approval events (plan actions, file updates/deletes) must never be dropped,
 * even when they target a project that isn't currently mounted — they're held
 * here until that project's router initializes. Module-level so the buffer
 * survives unmount/remount and project switches.
 */
const sharedApprovalEventBuffer = new Map<string, BufferedApprovalEvent[]>();

export interface ChatEventRouter {
  /** Handlers to register with `subscribeToChatEvents`. */
  handlers: ChatEventHandlers;
  /** Flush buffered approval events for this project and rehydrate live session state from the backend. */
  initialize: () => Promise<void>;
  /** One stale-stream watchdog poll. Safe to call on an interval; overlapping calls no-op. */
  tick: () => Promise<void>;
  /** Stop reacting to events. Late events for other projects still buffer. */
  dispose: () => void;
}

const WATCHDOG_POLL_MS = 15_000;

export { WATCHDOG_POLL_MS };

/**
 * Routes chat IPC events into the chat store and approval queue, owns the
 * cross-project approval-event buffer, and runs the stale-stream watchdog.
 * Pure wiring target: no React, no timers, no direct store imports — the
 * `useChatIpcBridge` hook adapts it to the component lifecycle.
 */
export function createChatEventRouter(deps: ChatEventRouterDeps): ChatEventRouter {
  const { projectId, getChatState, getApprovalQueue, services, emitStoreEvent, now } = deps;
  const approvalEventBuffer = deps.buffer ?? sharedApprovalEventBuffer;

  let active = true;

  const isActiveForProject = (eventProjectId: string) => active && eventProjectId === projectId;
  const isKnownChatSession = (sessionId: string | undefined): sessionId is string =>
    !!sessionId && getChatState().sessions.has(sessionId);

  const bufferApprovalEvent = (targetProjectId: string, event: BufferedApprovalEvent): void => {
    const existing = approvalEventBuffer.get(targetProjectId) ?? [];
    approvalEventBuffer.set(targetProjectId, [...existing, event]);
  };

  const processPlanActionsEvent = (data: PlanActionsEventData) => {
    if (data.actions.length > 0) {
      getApprovalQueue().processPlanActions(data.projectId, data.actions);
    }
  };
  const processFileUpdateEvent = (data: FileUpdateEventData) => {
    getApprovalQueue().processFileUpdate(
      data.projectId,
      data.filePath,
      data.content,
      data.oldContent ?? null,
      { forceReview: data.forceReview }
    );
    emitStoreEvent({
      type: 'chat-file-updated',
      payload: data,
    });
  };
  const processFileMoveEvent = (data: FileMoveEventData) => {
    getApprovalQueue().processFileMove(data.projectId, data.sourcePath, data.targetPath);
  };
  const processFileDeleteEvent = (data: FileDeleteEventData) => {
    getApprovalQueue().processFileDelete(data.projectId, data.path, data.isDirectory);
  };

  const flushBufferedApprovalEvents = (): void => {
    const bufferedApprovalEvents = approvalEventBuffer.get(projectId);
    if (!bufferedApprovalEvents || bufferedApprovalEvents.length === 0) return;
    approvalEventBuffer.delete(projectId);
    for (const event of bufferedApprovalEvents) {
      if (!active) break;
      if (event.type === 'plan-actions') processPlanActionsEvent(event.data);
      if (event.type === 'file-update') processFileUpdateEvent(event.data);
      if (event.type === 'file-move') processFileMoveEvent(event.data);
      if (event.type === 'file-delete') processFileDeleteEvent(event.data);
    }
  };

  const loadUsage = async (): Promise<void> => {
    const usage = await services.getChatUsage(projectId);
    if (!active) return;
    getChatState().setTokens(usage.totalTokens);
  };

  /**
   * Restore live session tabs after a reload or project switch. Backend
   * sessions may still be processing; renderer state must align with them so
   * switching back mid-run shows prior messages and doesn't double-send.
   */
  const rehydrateActiveSessions = async (): Promise<void> => {
    const result = await services.getActiveChatSessions(projectId);
    if (!active) return;
    if (!result.success || !result.sessions) return;

    const state = getChatState();
    let preferredSessionId: string | null = state.viewedSessionId;

    for (const session of result.sessions) {
      if (!active) return;
      if (session.scope !== 'main') continue;
      state.markSessionActive(session.chatSessionId);
      // Backend-restored sessions need DB hydration so switching back mid-run
      // shows prior messages, while new live chunks append to the same tab.
      state.getOrCreateSession(session.chatSessionId, { hydrated: false });

      // Seed live tab title from the persisted SDK summary so reloads don't
      // drop back to the numeric "Claude N" label until the next turn.
      if (session.title) {
        state.setSessionTitle(session.chatSessionId, session.title);
      }

      if (session.state === 'processing' || session.state === 'connecting') {
        state.setRetrying(session.chatSessionId);

        if (!preferredSessionId) {
          preferredSessionId = session.chatSessionId;
        }
      }

      // Keep renderer state aligned with backend to avoid duplicate sends after reload.
      state.setSessionState(session.chatSessionId, session.state);

      if (!preferredSessionId) {
        preferredSessionId = session.chatSessionId;
      }
    }

    if (!getChatState().viewedSessionId && preferredSessionId) {
      getChatState().setViewedSession(preferredSessionId);
    }
  };

  const handlers: ChatEventHandlers = {
    onChunk: (data) => {
      if (!isActiveForProject(data.projectId)) return;
      const sessionId = data.chatSessionId;
      if (isKnownChatSession(sessionId)) {
        getChatState().appendChunk(sessionId, data.text, data.segmentId, data.precedingActivities);
      }
    },
    onPlanActions: (data) => {
      if (!active || data.actions.length === 0) return;
      if (!isActiveForProject(data.projectId)) {
        bufferApprovalEvent(data.projectId, { type: 'plan-actions', data });
        return;
      }
      processPlanActionsEvent(data);
    },
    onFileUpdate: (data) => {
      if (!active) return;
      if (!isActiveForProject(data.projectId)) {
        bufferApprovalEvent(data.projectId, { type: 'file-update', data });
        return;
      }
      processFileUpdateEvent(data);
    },
    onFileMove: (data) => {
      if (!active) return;
      if (!isActiveForProject(data.projectId)) {
        bufferApprovalEvent(data.projectId, { type: 'file-move', data });
        return;
      }
      processFileMoveEvent(data);
    },
    onFileDelete: (data) => {
      if (!active) return;
      if (!isActiveForProject(data.projectId)) {
        bufferApprovalEvent(data.projectId, { type: 'file-delete', data });
        return;
      }
      processFileDeleteEvent(data);
    },
    onDone: (data) => {
      void (async () => {
        if (!isActiveForProject(data.projectId)) return;
        const sessionId = data.chatSessionId;
        if (!isKnownChatSession(sessionId)) return;
        const state = getChatState();
        // When a follow-up is queued, hand off atomically: finalize the
        // just-completed turn, clear the follow-up's queued flag, and
        // re-enter streaming in a single store update. Doing these as
        // separate calls (or letting the `chat:queue-cleared:already_sent`
        // echo clear the flag in a different tick) can render a stale
        // queued bubble next to a fresh thinking indicator.
        state.finalizeMessage(sessionId, {
          model: data.model,
          beforeClientMessageId: data.beforeClientMessageId,
          promoteQueuedClientMessageId: data.hasQueuedFollowUp ? data.queuedClientMessageId : undefined,
          // A follow-up the SDK answered within THIS turn (steered in, not
          // deferred): clear its stale "queued" badge without re-streaming.
          clearQueuedClientMessageId: data.consumedQueuedClientMessageId,
        });
        if (data.inputTokens !== undefined) {
          state.setLastTurnUsage(sessionId, {
            inputTokens: data.inputTokens,
            outputTokens: data.outputTokens ?? 0,
            cacheReadTokens: data.cacheReadTokens ?? 0,
            cacheCreationTokens: data.cacheCreationTokens ?? 0,
            contextWindow: data.contextWindow ?? null,
          });
        }
        if (data.hasQueuedFollowUp) {
          // finalizeMessage already cleared the queued flag and set
          // isStreaming; only the backend-facing session state remains.
          state.setSessionState(sessionId, 'processing');
        }
        const usage = await services.getChatUsage(projectId);
        if (!isActiveForProject(data.projectId)) return;
        getChatState().setTokens(usage.totalTokens);
      })();
    },
    onQueued: (data) => {
      // No-op for now — the user bubble is added optimistically with
      // queued=true in `useChat.send`. This event exists so the renderer
      // can confirm the backend accepted the queue, but we don't need
      // to mutate state here.
      if (!isActiveForProject(data.projectId)) return;
    },
    onQueueCleared: (data) => {
      if (!isActiveForProject(data.projectId)) return;
      const sessionId = data.chatSessionId;
      if (!isKnownChatSession(sessionId)) return;
      if (data.reason === 'already_sent') {
        // Race lost — the SDK pulled the message between cancel intent and
        // the IPC arriving. Drop the queued badge but keep the bubble; the
        // turn will stream normally.
        getChatState().clearQueuedFlag(sessionId, data.clientMessageId);
        return;
      }
      // Cancelled by user or lost to a session disconnect — drop the
      // bubble entirely. The message never reached the model.
      if (data.clientMessageId) {
        getChatState().removeQueuedUserMessage(sessionId, data.clientMessageId);
      }
    },
    onError: (data) => {
      if (!isActiveForProject(data.projectId)) return;
      const state = getChatState();
      const sessionId = data.chatSessionId ?? state.viewedSessionId ?? undefined;
      if (data.chatSessionId && !isKnownChatSession(data.chatSessionId)) return;
      if (isKnownChatSession(sessionId)) {
        if (data.error.includes('still responding')) {
          state.setRetrying(sessionId);
          state.setSessionState(sessionId, 'processing');
          return;
        }

        state.setError(sessionId, data.error);
      }
    },
    onActivity: (data) => {
      if (!isActiveForProject(data.projectId)) return;
      const sessionId = data.chatSessionId;
      if (!isKnownChatSession(sessionId)) return;
      // Result-side updates carry diffStats/diffHunks and reuse the original
      // activity id — route them to updateActivity so we don't duplicate cards.
      const isResultUpdate = !!(data.activity.diffStats || data.activity.diffHunks);
      if (isResultUpdate) {
        getChatState().updateActivity(sessionId, data.activity);
      } else {
        getChatState().addActivity(sessionId, data.activity);
      }
    },
    onThinking: (data) => {
      if (!isActiveForProject(data.projectId)) return;
      const sessionId = data.chatSessionId;
      if (isKnownChatSession(sessionId)) {
        getChatState().appendThinking(sessionId, data.text);
      }
    },
    onSessionConnecting: (data) => {
      if (!isActiveForProject(data.projectId)) return;
      const sessionId = data.chatSessionId;
      if (isKnownChatSession(sessionId)) {
        getChatState().setSessionState(sessionId, 'connecting');
        getChatState().markSessionActive(sessionId);
      }
    },
    onSessionReady: (data) => {
      if (!isActiveForProject(data.projectId)) return;
      const sessionId = data.chatSessionId;
      if (isKnownChatSession(sessionId)) {
        const state = getChatState();
        state.setSessionState(sessionId, 'ready');
        state.markSessionActive(sessionId);
        state.setMcpStatus(sessionId, false);
        if (data.sessionId) {
          state.setClaudeSessionId(sessionId, data.sessionId);
        }
      }
    },
    onSessionTitle: (data) => {
      if (!isActiveForProject(data.projectId)) return;
      const sessionId = data.chatSessionId;
      if (isKnownChatSession(sessionId) && data.title) {
        getChatState().setSessionTitle(sessionId, data.title);
      }
    },
    onSessionError: (data) => {
      if (!isActiveForProject(data.projectId)) return;
      const sessionId = data.chatSessionId;
      if (isKnownChatSession(sessionId)) {
        getChatState().setSessionState(sessionId, 'error');
        getChatState().setError(sessionId, data.error);
        console.warn('[chatEventRouter] Session error:', data.error);
      }
    },
    onSuggestions: (data) => {
      if (!isActiveForProject(data.projectId)) return;
      const sessionId = data.chatSessionId;
      if (isKnownChatSession(sessionId)) {
        getChatState().setSuggestions(sessionId, data.suggestions);
      }
    },
    // No project filter: the command list comes from the user's own Claude
    // settings, so it's the same for every project.
    onSlashCommands: (data) => {
      if (!active) return;
      getChatState().setSlashCommands(data.commands);
    },
    onMcpStatus: (data) => {
      if (!isActiveForProject(data.projectId)) return;
      const state = getChatState();
      const sessionId = data.chatSessionId ?? state.viewedSessionId ?? undefined;
      if (
        (data.chatSessionId && !isKnownChatSession(data.chatSessionId)) ||
        !isKnownChatSession(sessionId) ||
        data.serverName !== 'kpm'
      ) return;
      const isDegraded = data.status !== 'connected';
      state.setMcpStatus(sessionId, isDegraded, isDegraded ? (data.error ?? `Tools unavailable (${data.status})`) : null);
    },
    onSessionDeactivated: (data) => {
      if (!isActiveForProject(data.projectId)) return;
      const sessionId = data.chatSessionId;
      if (isKnownChatSession(sessionId)) {
        const state = getChatState();
        // Always finalize on teardown. This safely no-ops after completed
        // turns and ensures buffered-only viewed chunks are not dropped.
        state.finalizeMessage(sessionId);
        state.setSessionState(sessionId, 'idle');
        state.markSessionInactive(sessionId);
      }
    },
  };

  // Watchdog: a session that claims to be streaming but hasn't received a
  // chunk/activity update past the stale threshold is suspected on one poll
  // and confirmed on the next (same lastStreamUpdateAt) before we ask the
  // backend. Only a backend state that is neither processing nor connecting
  // force-finalizes the stuck turn.
  const suspectedStaleSessions = new Map<string, number>();
  let isWatchdogPolling = false;

  const tick = async (): Promise<void> => {
    if (!active) return;
    if (isWatchdogPolling) return;
    isWatchdogPolling = true;

    try {
      const { sessions } = getChatState();
      const currentTime = now();
      const currentlyStreaming = new Set<string>();

      for (const [sessionId, session] of sessions.entries()) {
        if (!session.isStreaming) continue;
        currentlyStreaming.add(sessionId);

        const lastStreamUpdateAt = session.lastStreamUpdateAt ?? session.streamStartedAt;
        if (!lastStreamUpdateAt) {
          suspectedStaleSessions.delete(sessionId);
          continue;
        }

        const previousSuspectedUpdateAt = suspectedStaleSessions.get(sessionId);
        if (previousSuspectedUpdateAt !== undefined && previousSuspectedUpdateAt !== lastStreamUpdateAt) {
          // Stream activity resumed; clear stale suspicion.
          suspectedStaleSessions.delete(sessionId);
        }

        if (!isStreamStale(session, currentTime)) {
          suspectedStaleSessions.delete(sessionId);
          continue;
        }

        if (!suspectedStaleSessions.has(sessionId)) {
          // First stale poll: mark suspected and confirm on next poll.
          suspectedStaleSessions.set(sessionId, lastStreamUpdateAt);
          continue;
        }

        const suspectedUpdateAt = suspectedStaleSessions.get(sessionId);
        if (suspectedUpdateAt !== lastStreamUpdateAt) {
          suspectedStaleSessions.set(sessionId, lastStreamUpdateAt);
          continue;
        }

        const stateResult = await services.getChatSessionState(projectId, sessionId);
        if (!active) return;
        const backendState = stateResult.success ? stateResult.state : undefined;

        if (
          backendState &&
          backendState !== 'processing' &&
          backendState !== 'connecting'
        ) {
          console.warn(
            `[Watchdog] Stale streaming confirmed for session ${sessionId}, backend: ${backendState}, idle for ${Math.round((currentTime - lastStreamUpdateAt) / 1000)}s`
          );
          getChatState().finalizeMessage(sessionId);
          suspectedStaleSessions.delete(sessionId);
        }
      }

      for (const suspectedSessionId of Array.from(suspectedStaleSessions.keys())) {
        if (!currentlyStreaming.has(suspectedSessionId)) {
          suspectedStaleSessions.delete(suspectedSessionId);
        }
      }
    } catch (error) {
      console.warn('[Watchdog] Poll failed:', error);
    } finally {
      isWatchdogPolling = false;
    }
  };

  const initialize = async (): Promise<void> => {
    flushBufferedApprovalEvents();
    await Promise.all([loadUsage(), rehydrateActiveSessions()]);
  };

  return {
    handlers,
    initialize,
    tick,
    dispose: () => {
      active = false;
    },
  };
}
