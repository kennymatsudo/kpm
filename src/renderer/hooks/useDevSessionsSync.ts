import { useCallback, useEffect } from 'react';
import { subscribeToSessionStatusChanges } from '../services/devSessionService';
import {
  subscribeToAgentStateChanges,
  subscribeToAgentActivities,
  subscribeToAgentQuestions,
  subscribeToAgentComplete,
  subscribeToAgentErrors,
} from '../services/agentSessionService';
import { subscribeToReviewActionable } from '../services/reviewService';
import { useDevSessionsStore } from '../stores/devSessions';
import { createAgentEventRouter } from './agentEventRouter';

/**
 * Truth-fetching (initial load, session-status-driven reload, 30s poll) plus
 * the thin adapter wiring agent-session IPC events to `createAgentEventRouter`.
 * All event-routing logic (the stale-event drop filter, dispatch to store
 * handlers) lives in `agentEventRouter.ts` — this hook only adapts it to the
 * component lifecycle and supplies the truth data it filters against.
 */
export function useDevSessionsSync(projectId: string | null): void {
  const loadSessionsFromStore = useDevSessionsStore((state) => state.loadSessions);

  const loadSessions = useCallback(async () => {
    await loadSessionsFromStore(projectId || '');
  }, [projectId, loadSessionsFromStore]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!projectId) return;

    const handler = (event: { projectId: string }) => {
      if (event.projectId === projectId) {
        void loadSessions();
      }
    };

    return subscribeToSessionStatusChanges(handler);
  }, [projectId, loadSessions]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadSessions();
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadSessions]);

  useEffect(() => {
    const router = createAgentEventRouter({
      getStore: () => useDevSessionsStore.getState(),
      getKnownSessionIds: () => {
        const state = useDevSessionsStore.getState();
        if (state.projectId !== projectId || state.isLoading) return null;
        return new Set(state.sessionById.keys());
      },
    });

    const cleanupState = subscribeToAgentStateChanges(router.handlers.onStateChanged);
    const cleanupActivity = subscribeToAgentActivities(router.handlers.onActivity);
    const cleanupQuestion = subscribeToAgentQuestions(router.handlers.onQuestion);
    const cleanupComplete = subscribeToAgentComplete(router.handlers.onComplete);
    const cleanupError = subscribeToAgentErrors(router.handlers.onError);
    const cleanupActionable = subscribeToReviewActionable(router.handlers.onReviewActionable);

    return () => {
      router.dispose();
      cleanupState();
      cleanupActivity();
      cleanupQuestion();
      cleanupComplete();
      cleanupError();
      cleanupActionable();
    };
  }, [projectId]);
}
