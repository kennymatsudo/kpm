import { useCallback, useEffect } from 'react';

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
}
