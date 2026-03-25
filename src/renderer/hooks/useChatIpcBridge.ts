import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { emit } from '../stores/storeEvents';

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
    setSessionState,
    setRetrying,
    markSessionActive,
    markSessionInactive,
    setViewedSession,
    getOrCreateSession,
  } = useChatStore(useShallow((state) => ({
    appendChunk: state.appendChunk,
    appendThinking: state.appendThinking,
    finalizeMessage: state.finalizeMessage,
    setError: state.setError,
    setTokens: state.setTokens,
    addActivity: state.addActivity,
    setSessionState: state.setSessionState,
    setRetrying: state.setRetrying,
    markSessionActive: state.markSessionActive,
    markSessionInactive: state.markSessionInactive,
    setViewedSession: state.setViewedSession,
    getOrCreateSession: state.getOrCreateSession,
  })));

  const {
    processPlanActions,
    processFileUpdate,
    processPlanActions: state.processPlanActions,
    processFileUpdate: state.processFileUpdate,
  })));

  useEffect(() => {
    if (!projectId) return;

    void (async () => {
      setTokens(usage.totalTokens);
    })();

    // Load active sessions from backend on mount
    void (async () => {
      if (result.success && result.sessions) {
        let preferredSessionId: string | null = useChatStore.getState().viewedSessionId;

        for (const session of result.sessions) {
          markSessionActive(session.chatSessionId);

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
        }

        }
    });

    const WATCHDOG_POLL_MS = 15_000;
    const WATCHDOG_STALE_THRESHOLD_MS = 30_000;
    const suspectedStaleSessions = new Map<string, number>();
    let isWatchdogPolling = false;

    const watchdogInterval = setInterval(() => {
      void (async () => {
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
      clearInterval(watchdogInterval);
    };
}
