import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { useChat } from '../../hooks/useChat';

  const [lastMessage, setLastMessage] = useState<string | null>(null);

    setLastMessage(message);

  const handleRetry = useCallback(() => {
    }

  return (
      <div
        style={{
        }}
      >
        <button
          style={{ color: 'color-mix(in srgb, var(--color-accent) 60%, transparent)' }}
        >
        </button>
      </div>

      {/* Error banner */}
      {error && (
          <svg className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-danger">{error}</p>
            {lastMessage && (
              <button
                onClick={handleRetry}
                className="text-xs text-danger/80 hover:text-danger underline mt-1"
              >
                Retry last message
              </button>
            )}
          </div>
          <button
            className="text-danger/60 hover:text-danger transition-colors flex-shrink-0"
          >
          </button>
        </div>
      )}

    </div>
  );
}
