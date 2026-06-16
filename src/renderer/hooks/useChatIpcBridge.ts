import { useEffect } from 'react';
import { useChatStore, useApprovalQueueStore, useGeneralSettingsStore } from '../stores';
import { useShallow } from 'zustand/react/shallow';
import { emit } from '../stores/storeEvents';
import {
  getActiveChatSessions,
  getChatSessionState,
  getChatUsage,
  subscribeToChatEvents,
} from '../services/chatService';

/**
 * Bridge hook that registers ALL chat IPC listeners at the Layout level.
 *
 * Previously these listeners lived inside `useChat`, which only mounted when
 * the Chat component was rendered. When the user switched to the Development
 * view (no Chat component), events like `onFileUpdate` and `onPlanActions`
 * were silently dropped, causing approval modals to never appear.
 *
 * By calling this hook from Layout (always mounted), events are captured
 * regardless of the active view.
 */
export function useChatIpcBridge(projectId: string | null): void {
  const {
    appendChunk,
    appendThinking,
    finalizeMessage,
    setError,
    setTokens,
    addActivity,
    updateActivity,
    setSuggestions,
    setSlashCommands,
    setSessionState,
    setRetrying,
    markSessionActive,
    markSessionInactive,
    setViewedSession,
    getOrCreateSession,
    setClaudeSessionId,
    setSessionTitle,
    setMcpStatus,
    setLastTurnUsage,
    clearQueuedFlag,
    removeQueuedUserMessage,
  } = useChatStore(useShallow((state) => ({
    appendChunk: state.appendChunk,
    appendThinking: state.appendThinking,
    finalizeMessage: state.finalizeMessage,
    setError: state.setError,
    setTokens: state.setTokens,
    addActivity: state.addActivity,
    updateActivity: state.updateActivity,
    setSuggestions: state.setSuggestions,
    setSlashCommands: state.setSlashCommands,
    setSessionState: state.setSessionState,
    setRetrying: state.setRetrying,
    markSessionActive: state.markSessionActive,
    markSessionInactive: state.markSessionInactive,
    setViewedSession: state.setViewedSession,
    getOrCreateSession: state.getOrCreateSession,
    setClaudeSessionId: state.setClaudeSessionId,
    setSessionTitle: state.setSessionTitle,
    setMcpStatus: state.setMcpStatus,
    setLastTurnUsage: state.setLastTurnUsage,
    clearQueuedFlag: state.clearQueuedFlag,
    removeQueuedUserMessage: state.removeQueuedUserMessage,
  })));

  const {
    processPlanActions,
    processFileUpdate,
    processFileDelete,
  } = useApprovalQueueStore(useShallow((state) => ({
    processPlanActions: state.processPlanActions,
    processFileUpdate: state.processFileUpdate,
    processFileDelete: state.processFileDelete,
  })));

  useEffect(() => {
    if (!projectId) return;

    let active = true;
    const isActiveForProject = (eventProjectId: string) => active && eventProjectId === projectId;
    const isKnownChatSession = (sessionId: string | undefined): sessionId is string =>
      !!sessionId && useChatStore.getState().sessions.has(sessionId);

    // Load persisted token count and chat approval preference on project select
    void useGeneralSettingsStore.getState().loadApprovalMode();
    void (async () => {
      const usage = await getChatUsage(projectId);
      if (!active) return;
      setTokens(usage.totalTokens);
    })();

    // Load active sessions from backend on mount
    void (async () => {
      const result = await getActiveChatSessions(projectId);
      if (!active) return;
      if (result.success && result.sessions) {
        let preferredSessionId: string | null = useChatStore.getState().viewedSessionId;

        for (const session of result.sessions) {
          if (!active) return;
          markSessionActive(session.chatSessionId);

          // Seed live tab title from the persisted SDK summary so reloads
          // don't drop back to the numeric "Claude N" label until the next turn.
          if (session.title) {
            setSessionTitle(session.chatSessionId, session.title);
          }

          if (session.state === 'processing' || session.state === 'connecting') {
            setRetrying(session.chatSessionId);

            if (!preferredSessionId) {
              preferredSessionId = session.chatSessionId;
            }
          }

          // Keep renderer state aligned with backend to avoid duplicate sends after reload.
          setSessionState(session.chatSessionId, session.state);

          if (!preferredSessionId) {
            preferredSessionId = session.chatSessionId;
          }
        }

        if (!useChatStore.getState().viewedSessionId && preferredSessionId) {
          setViewedSession(preferredSessionId);
        }
      }
    })();

    // Subscribe to unified chat IPC events
    // Events now include chatSessionId for routing to correct session
    const unsubscribeChatEvents = subscribeToChatEvents({
      onChunk: (data) => {
        if (!isActiveForProject(data.projectId)) return;
        const sessionId = data.chatSessionId;
        if (isKnownChatSession(sessionId)) {
          appendChunk(sessionId, data.text, data.segmentId, data.precedingActivities);
        }
      },
      onPlanActions: (data) => {
        }
      },
      onFileUpdate: (data) => {
        }
      },
      onFileDelete: (data) => {
        }
      },
      onDone: (data) => {
        void (async () => {
          if (!isActiveForProject(data.projectId)) return;
          const sessionId = data.chatSessionId;
          if (!isKnownChatSession(sessionId)) return;
          // When a follow-up is queued, hand off atomically: finalize the
          // just-completed turn, clear the follow-up's queued flag, and
          // re-enter streaming in a single store update. Doing these as
          // separate calls (or letting the `chat:queue-cleared:already_sent`
          // echo clear the flag in a different tick) can render a stale
          // queued bubble next to a fresh thinking indicator.
          finalizeMessage(sessionId, {
            model: data.model,
            beforeClientMessageId: data.beforeClientMessageId,
            promoteQueuedClientMessageId: data.hasQueuedFollowUp ? data.queuedClientMessageId : undefined,
            // A follow-up the SDK answered within THIS turn (steered in, not
            // deferred): clear its stale "queued" badge without re-streaming.
            clearQueuedClientMessageId: data.consumedQueuedClientMessageId,
          });
          if (data.inputTokens !== undefined) {
            setLastTurnUsage(sessionId, {
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
            setSessionState(sessionId, 'processing');
          }
          const usage = await getChatUsage(projectId);
          if (!isActiveForProject(data.projectId)) return;
          setTokens(usage.totalTokens);
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
          clearQueuedFlag(sessionId, data.clientMessageId);
          return;
        }
        // Cancelled by user or lost to a session disconnect — drop the
        // bubble entirely. The message never reached the model.
        if (data.clientMessageId) {
          removeQueuedUserMessage(sessionId, data.clientMessageId);
        }
      },
      onError: (data) => {
        if (!isActiveForProject(data.projectId)) return;
        const sessionId = data.chatSessionId ?? useChatStore.getState().viewedSessionId ?? undefined;
        if (data.chatSessionId && !isKnownChatSession(data.chatSessionId)) return;
        if (isKnownChatSession(sessionId)) {
          if (data.error.includes('still responding')) {
            setRetrying(sessionId);
            setSessionState(sessionId, 'processing');
            return;
          }

          setError(sessionId, data.error);
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
          updateActivity(sessionId, data.activity);
        } else {
          addActivity(sessionId, data.activity);
        }
      },
      onThinking: (data) => {
        if (!isActiveForProject(data.projectId)) return;
        const sessionId = data.chatSessionId;
        if (isKnownChatSession(sessionId)) {
          appendThinking(sessionId, data.text);
        }
      },
      onSessionConnecting: (data) => {
        if (!isActiveForProject(data.projectId)) return;
        const sessionId = data.chatSessionId;
        if (isKnownChatSession(sessionId)) {
          setSessionState(sessionId, 'connecting');
          markSessionActive(sessionId);
        }
      },
      onSessionReady: (data) => {
        if (!isActiveForProject(data.projectId)) return;
        const sessionId = data.chatSessionId;
        if (isKnownChatSession(sessionId)) {
          setSessionState(sessionId, 'ready');
          markSessionActive(sessionId);
          setMcpStatus(sessionId, false);
          if (data.sessionId) {
            setClaudeSessionId(sessionId, data.sessionId);
          }
        }
      },
      onSessionTitle: (data) => {
        if (!isActiveForProject(data.projectId)) return;
        const sessionId = data.chatSessionId;
        if (isKnownChatSession(sessionId) && data.title) {
          setSessionTitle(sessionId, data.title);
        }
      },
      onSessionError: (data) => {
        if (!isActiveForProject(data.projectId)) return;
        const sessionId = data.chatSessionId;
        if (isKnownChatSession(sessionId)) {
          setSessionState(sessionId, 'error');
          setError(sessionId, data.error);
          console.warn('[useChatIpcBridge] Session error:', data.error);
        }
      },
      onSuggestions: (data) => {
        if (!isActiveForProject(data.projectId)) return;
        const sessionId = data.chatSessionId;
        if (isKnownChatSession(sessionId)) {
          setSuggestions(sessionId, data.suggestions);
        }
      },
      // No project filter: the command list comes from the user's own Claude
      // settings, so it's the same for every project.
      onSlashCommands: (data) => {
        setSlashCommands(data.commands);
      },
      onMcpStatus: (data) => {
        if (!isActiveForProject(data.projectId)) return;
        const sessionId = data.chatSessionId ?? useChatStore.getState().viewedSessionId ?? undefined;
        if (
          (data.chatSessionId && !isKnownChatSession(data.chatSessionId)) ||
          !isKnownChatSession(sessionId) ||
          data.serverName !== 'kpm'
        ) return;
        const isDegraded = data.status !== 'connected';
        setMcpStatus(sessionId, isDegraded, isDegraded ? (data.error ?? `Tools unavailable (${data.status})`) : null);
      },
      onSessionDeactivated: (data) => {
        if (!isActiveForProject(data.projectId)) return;
        const sessionId = data.chatSessionId;
        if (isKnownChatSession(sessionId)) {
          // Always finalize on teardown. This safely no-ops after completed
          // turns and ensures buffered-only viewed chunks are not dropped.
          finalizeMessage(sessionId);
          setSessionState(sessionId, 'idle');
          markSessionInactive(sessionId);
        }
      },
    });

    const WATCHDOG_POLL_MS = 15_000;
    const WATCHDOG_STALE_THRESHOLD_MS = 30_000;
    const suspectedStaleSessions = new Map<string, number>();
    let isWatchdogPolling = false;

    const watchdogInterval = setInterval(() => {
      void (async () => {
        if (!active) return;
        if (isWatchdogPolling) return;
        isWatchdogPolling = true;

        try {
          const { sessions } = useChatStore.getState();
          const now = Date.now();
          const currentlyStreaming = new Set<string>();

          for (const [sessionId, session] of sessions.entries()) {
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

            const elapsedMs = now - lastStreamUpdateAt;
            if (elapsedMs < WATCHDOG_STALE_THRESHOLD_MS) {
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

            const stateResult = await getChatSessionState(projectId, sessionId);
            if (!active) return;
            const backendState = stateResult.success ? stateResult.state : undefined;

            if (
              backendState &&
              backendState !== 'processing' &&
              backendState !== 'connecting'
            ) {
              console.warn(
                `[Watchdog] Stale streaming confirmed for session ${sessionId}, backend: ${backendState}, idle for ${Math.round(elapsedMs / 1000)}s`
              );
              finalizeMessage(sessionId);
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
      })();
    }, WATCHDOG_POLL_MS);

    return () => {
      active = false;
      clearInterval(watchdogInterval);
      unsubscribeChatEvents();
    };
  }, [projectId, appendChunk, appendThinking, finalizeMessage, processPlanActions, processFileUpdate, processFileDelete, setError, setTokens, addActivity, updateActivity, setSuggestions, setSlashCommands, setSessionState, setRetrying, markSessionActive, markSessionInactive, setViewedSession, getOrCreateSession, setClaudeSessionId, setSessionTitle, setMcpStatus, setLastTurnUsage]);
}
