import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

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
    finalizeMessage,
    setError,
    setTokens,
    addActivity,
    setSessionState,
    markSessionActive,
    markSessionInactive,
    getOrCreateSession,
  } = useChatStore(useShallow((state) => ({
    appendChunk: state.appendChunk,
    finalizeMessage: state.finalizeMessage,
    setError: state.setError,
    setTokens: state.setTokens,
    addActivity: state.addActivity,
    setSessionState: state.setSessionState,
    markSessionActive: state.markSessionActive,
    markSessionInactive: state.markSessionInactive,
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
        for (const session of result.sessions) {
          markSessionActive(session.chatSessionId);
        }
      }
    })();

    // Subscribe to unified chat IPC events
    // Events now include chatSessionId for routing to correct session
    });

    return () => {
    };
}
