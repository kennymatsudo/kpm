import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../../stores/chat';

const RETRY_MAX_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 2000;
const RETRY_MAX_DELAY_MS = 30000;

export function useModelChoiceRetry(): void {
  const { projectId, sessionId, needsRetry, openChatChoice } = useChatStore(useShallow((state) => {
    const session = state.viewedSessionId ? state.sessions.get(state.viewedSessionId) : null;
    const piDescriptor = session?.choice?.providers.find((provider) => provider.provider === 'pi');
    const piSelectedButEmpty =
      session?.choice?.selected.provider === 'pi'
      && !(piDescriptor?.models ?? []).some((model) => model.available);
    return {
      projectId: state.persistedProjectId,
      sessionId: state.viewedSessionId,
      needsRetry: piSelectedButEmpty,
      openChatChoice: state.openChatChoice,
    };
  }));

  useEffect(() => {
    if (!needsRetry || !projectId || !sessionId) return;
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      if (attempt >= RETRY_MAX_ATTEMPTS) return;
      const delay = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
      attempt += 1;
      timer = setTimeout(() => {
        if (cancelled) return;
        void openChatChoice(projectId, sessionId);
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [needsRetry, projectId, sessionId, openChatChoice]);
}
