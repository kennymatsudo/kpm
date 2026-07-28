import { useChatStore } from '../../stores';
import { useShallow } from 'zustand/react/shallow';
import { copyToClipboard } from '../../utils/clipboard';
import { SessionHistory } from './SessionHistory';
import { NewSessionButton } from './NewSessionButton';
import { UnlockIcon } from '../icons';
import { useWriteGrant } from './useWriteGrant';

export function ChatHeader() {
  const { claudeSessionId, viewedSessionId } = useChatStore(
    useShallow((state) => {
      const session = state.viewedSessionId
        ? state.sessions.get(state.viewedSessionId)
        : null;
      return {
        claudeSessionId: session?.claudeSessionId ?? null,
        viewedSessionId: state.viewedSessionId,
      };
    })
  );
  const { writesEnabled, revoke } = useWriteGrant(viewedSessionId);

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
        {writesEnabled && (
          <button
            onClick={revoke}
            title="Writes are enabled for this conversation. Click to revoke."
            className="flex items-center gap-1 px-2 py-0.5 mr-1 text-[11px] font-medium rounded border border-warning/40 text-warning hover:bg-warning/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <UnlockIcon className="w-3 h-3 flex-shrink-0" />
            <span>Writes enabled</span>
          </button>
        )}
        <SessionHistory />
        <NewSessionButton />
      </div>
    </div>
  );
}
