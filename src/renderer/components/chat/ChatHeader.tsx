import { useChatStore } from '../../stores';
import { useShallow } from 'zustand/react/shallow';
import { SessionHistory } from './SessionHistory';
import { NewSessionButton } from './NewSessionButton';

export function ChatHeader() {
    useShallow((state) => {
      const session = state.viewedSessionId
        ? state.sessions.get(state.viewedSessionId)
        : null;
    })
  );

  const handleCopySessionId = () => {
    if (claudeSessionId) {
    }
  };

  return (
      <div className="flex items-center gap-2 min-w-0">
        {claudeSessionId && (
          <button
            onClick={handleCopySessionId}
            className="ml-1 text-[10px] font-mono text-text-muted/40 hover:text-text-muted/70 transition-colors cursor-pointer flex-shrink-0"
            title={`Session: ${claudeSessionId} (click to copy)`}
          >
            {claudeSessionId.slice(0, 8)}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <SessionHistory />
        <NewSessionButton />
      </div>
    </div>
  );
}
