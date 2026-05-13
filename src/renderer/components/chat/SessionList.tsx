import { useChatStore, useProjectDomainStore } from '../../stores';
import { cancelChatSession, disconnectChatSession } from '../../services/chatService';
import { useShallow } from 'zustand/react/shallow';
import { CloseIcon } from '../icons';

/**
 * Session tabs showing all active and recent sessions.
 * Allows switching between sessions and closing them.
 */
export function SessionList() {
  const { currentProjectId } = useProjectDomainStore(useShallow((state) => ({
    currentProjectId: state.currentProjectId,
  })));

  const sessionIds = useChatStore(useShallow((state) =>
    Array.from(state.sessions.entries())
      .sort((a, b) => a[1].sessionNumber - b[1].sessionNumber)
      .map(([id]) => id)
  ));

  // Hide only when there are no sessions; with 1+ sessions, always render so the close affordance is available.
  if (sessionIds.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-surface-1 border-b border-border overflow-x-auto scrollbar-none">
      {sessionIds.map((sessionId) => (
        <SessionTab
          key={sessionId}
          sessionId={sessionId}
          currentProjectId={currentProjectId}
        />
      ))}
    </div>
  );
}

function SessionTab({
  sessionId,
  currentProjectId,
}: {
  sessionId: string;
  currentProjectId: string | null;
}) {
  const {
    title,
    sessionNumber,
    messageCount,
    isStreaming,
    isActive,
    isViewed,
    setViewedSession,
    removeSession,
  } = useChatStore(useShallow((state) => {
    const session = state.sessions.get(sessionId);
    return {
      title: session?.title ?? null,
      sessionNumber: session?.sessionNumber ?? null,
      messageCount: session?.messages.length ?? 0,
      isStreaming: session?.isStreaming ?? false,
      isActive: state.activeSessionIds.has(sessionId),
      isViewed: state.viewedSessionId === sessionId,
      setViewedSession: state.setViewedSession,
      removeSession: state.removeSession,
    };
  }));

    return null;
  }

  const handleCloseSession = async (chatSessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentProjectId) return;

    // If streaming, cancel first (interrupt with timeout + force-disconnect fallback)
    if (isActive && isStreaming) {
    }

    // Always call disconnect — streaming-layer cleanup is idempotent for
    // inactive sessions, ensuring any active subprocess is torn down cleanly.
    await disconnectChatSession(currentProjectId, chatSessionId);

    // Remove session entirely (handles view switching internally)
    removeSession(chatSessionId);
  };

  return (
    <div
      role="tab"
      tabIndex={0}
      aria-selected={isViewed}
      onClick={() => setViewedSession(sessionId)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewedSession(sessionId); } }}
      className={`
        flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs cursor-pointer
        transition-all duration-150 min-w-[80px] max-w-[200px]
        ${isViewed
          ? 'bg-accent/10 text-accent font-medium'
          : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-2'
        }
      `}
    >
      {/* Status indicator */}
      {isActive && isStreaming ? (
        <svg
          className="w-3 h-3 animate-spin text-accent"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : isActive ? (
        <span className="w-2 h-2 rounded-full flex-shrink-0 bg-green-500" />
      ) : (
        <span className="w-2 h-2 rounded-full flex-shrink-0 bg-text-muted/40" />
      )}

      {/* Session name: SDK summary when available, fall back to "Session N". */}
      <span className="flex-1 min-w-0 truncate" title={title ?? undefined}>
        {title ?? `Session ${sessionNumber}`}
      </span>

      {/* Message count badge */}
      {messageCount > 0 && (
        <span className="text-xxs text-text-muted flex-shrink-0">
          ({messageCount})
        </span>
      )}

      {/* Close button */}
      <button
        onClick={(e) => void handleCloseSession(sessionId, e)}
        className="ml-0.5 p-0.5 rounded hover:bg-surface-3 text-text-muted hover:text-danger transition-colors flex-shrink-0"
        title="Close session"
      >
        <CloseIcon className="w-3 h-3" />
      </button>
    </div>
  );
}
