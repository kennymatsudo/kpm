import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../../stores/chat';
import { ChatChoiceControls } from './ChatChoiceControls';

export function ModelSelector() {
  const {
    viewedSessionId,
    choice,
    isStreaming,
    changeChatChoice,
  } = useChatStore(useShallow((state) => {
    const session = state.viewedSessionId ? state.sessions.get(state.viewedSessionId) : null;
    return {
      viewedSessionId: state.viewedSessionId,
      choice: session?.choice ?? null,
      isStreaming: session?.isStreaming ?? false,
      changeChatChoice: state.changeChatChoice,
    };
  }));

  if (!viewedSessionId || !choice) {
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
