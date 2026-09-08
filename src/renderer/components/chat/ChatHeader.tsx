import { useChatStore } from '../../stores';
import { copyToClipboard } from '../../utils/clipboard';
import { SessionHistory } from './SessionHistory';
import { SessionList } from './SessionList';
import { NewSessionButton } from './NewSessionButton';
import { HashIcon } from '../icons';
import { Tooltip } from '../ui/Tooltip';
import { HEADER_ICON_BUTTON } from './headerControls';

export function ChatHeader() {
  const claudeSessionId = useChatStore((state) => {
    const session = state.viewedSessionId
      ? state.sessions.get(state.viewedSessionId)
      : null;
    return session?.claudeSessionId ?? null;
  });

  const handleCopySessionId = () => {
    if (claudeSessionId) {
      void copyToClipboard(claudeSessionId, 'Session ID');
    }
  };

  return (
    <div className="relative z-10 flex items-center gap-2 flex-shrink-0 px-2 py-1 border-b border-border-subtle/60 bg-surface-1">
      <SessionList />
      <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto">
        <span className="mx-1 h-4 w-px bg-border-default flex-shrink-0" aria-hidden="true" />
        {claudeSessionId && (
          <Tooltip content={<span className="font-mono">Copy session ID {claudeSessionId}</span>}>
            <button
              onClick={handleCopySessionId}
              className={HEADER_ICON_BUTTON}
              aria-label={`Copy session id ${claudeSessionId}`}
            >
              <HashIcon className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        )}
        <SessionHistory />
        <NewSessionButton />
      </div>
    </div>
  );
}
