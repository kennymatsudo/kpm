import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../../stores/chat';
import { ChatChoiceControls } from './ChatChoiceControls';
import { useModelChoiceRetry } from './useModelChoiceRetry';

export function ModelSelector() {
  useModelChoiceRetry();

  const {
    viewedSessionId,
    projectId,
    choice,
    error,
    isStreaming,
    changeChatChoice,
    openChatChoice,
  } = useChatStore(useShallow((state) => {
    const session = state.viewedSessionId ? state.sessions.get(state.viewedSessionId) : null;
    return {
      viewedSessionId: state.viewedSessionId,
      projectId: state.persistedProjectId,
      choice: session?.choice ?? null,
      error: session?.error ?? null,
      isStreaming: session?.isStreaming ?? false,
      changeChatChoice: state.changeChatChoice,
      openChatChoice: state.openChatChoice,
    };
  }));

  if (!viewedSessionId || !choice) {
    if (error && viewedSessionId && projectId) {
      return (
        <div className="inline-flex h-8 min-w-0 items-center gap-2 rounded-lg border border-border-subtle bg-surface-0/70 px-2.5 text-xs">
          <span className="min-w-0 truncate text-warning" title={error}>Models unavailable</span>
          <button
            type="button"
            onClick={() => void openChatChoice(projectId, viewedSessionId)}
            className="shrink-0 rounded px-1.5 py-0.5 font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      );
    }
    return (
      <div className="inline-flex h-8 items-center rounded-lg border border-border-subtle bg-surface-0/70 px-2.5 text-xs text-text-muted">
        Loading models…
      </div>
    );
  }

  return (
    <ChatChoiceControls
      choice={choice}
      disabled={isStreaming}
      onChange={(intent) => changeChatChoice(viewedSessionId, intent)}
    />
  );
}
