import { useCallback, useEffect } from 'react';
import {
  subscribeToAgentStateChanges,
  subscribeToAgentActivities,
  subscribeToAgentQuestions,
  subscribeToAgentComplete,
  subscribeToAgentErrors,
} from '../services/agentSessionService';
import { subscribeToReviewActionable } from '../services/reviewService';
import { useDevSessionsStore } from '../stores/devSessions';

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
    const cleanupState = subscribeToAgentStateChanges((event) => {
      useDevSessionsStore.getState().handleAgentStateChanged(event.devSessionId, event.state);
    });

    const cleanupActivity = subscribeToAgentActivities((event) => {
      useDevSessionsStore.getState().handleAgentActivity(event.devSessionId, event.activity);
    });

    const cleanupQuestion = subscribeToAgentQuestions((event) => {
      useDevSessionsStore.getState().handleAgentQuestion(event.devSessionId, event.question);
    });

    const cleanupComplete = subscribeToAgentComplete((event) => {
      useDevSessionsStore.getState().handleAgentComplete(event.devSessionId, event.summary, event.findings);
    });

    const cleanupError = subscribeToAgentErrors((event) => {
      useDevSessionsStore.getState().handleAgentError(event.devSessionId, event.error);
    });

    const cleanupActionable = subscribeToReviewActionable((summary) => {
      useDevSessionsStore.getState().setReviewActionable(summary);
    });

    return () => {
      cleanupState();
      cleanupActivity();
      cleanupQuestion();
      cleanupComplete();
      cleanupError();
      cleanupActionable();
    };
  }, []);
}
