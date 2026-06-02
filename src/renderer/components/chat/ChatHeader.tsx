import { useChatStore } from '../../stores';
import { useShallow } from 'zustand/react/shallow';
import { copyToClipboard } from '../../utils/clipboard';
import { SessionHistory } from './SessionHistory';
import { NewSessionButton } from './NewSessionButton';

export function ChatHeader() {
  const claudeSessionId = useChatStore(
    useShallow((state) => {
      const session = state.viewedSessionId
        ? state.sessions.get(state.viewedSessionId)
        : null;
      return session?.claudeSessionId ?? null;
    })
  );

  const handleCopySessionId = () => {
    if (claudeSessionId) {
      void copyToClipboard(claudeSessionId, 'Session ID');
    }
  };

  return (
    <div className="relative z-10 flex items-center justify-between flex-shrink-0 px-4 py-2.5 border-b border-border-subtle/60 bg-surface-1">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium text-text-primary flex-shrink-0">KPM</span>
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
