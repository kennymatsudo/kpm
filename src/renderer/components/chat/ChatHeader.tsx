import { useChatStore } from '../../stores';
import { SessionHistory } from './SessionHistory';
import { NewSessionButton } from './NewSessionButton';

export function ChatHeader() {

  const handleCopySessionId = () => {
    if (claudeSessionId) {
    }
  };

  return (
        {claudeSessionId && (
          <button
            onClick={handleCopySessionId}
            title={`Session: ${claudeSessionId} (click to copy)`}
          >
            {claudeSessionId.slice(0, 8)}
          </button>
        )}
      </div>
        <SessionHistory />
        <NewSessionButton />
      </div>
    </div>
  );
}
