import { useCallback, useState } from 'react';
import { useProjectDomainStore, useChatStore } from '../../stores';
import { useShallow } from 'zustand/react/shallow';

/**
 * Button to start a new chat session.
 * Supports both parallel sessions (keep current active) and replacing current session.
 *
 * Note: This component directly calls the API instead of using useChat hook
 * to avoid registering duplicate event listeners when both Chat and NewSessionButton
 * are mounted simultaneously.
 */
export function NewSessionButton() {
  const { currentProjectId } = useProjectDomainStore(useShallow((state) => ({
    currentProjectId: state.currentProjectId,
  })));

  );

  const [keepActive, setKeepActive] = useState(true);

    if (!currentProjectId) return;

    startNewChatSession(keepActive);


  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleNewSession}
        className={`
          flex items-center gap-1.5 px-2 py-1 rounded-lg
          transition-all duration-150
          text-text-tertiary hover:text-text-secondary hover:bg-surface-3
          disabled:opacity-40 disabled:cursor-not-allowed
        `}
        aria-label="New session"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4v16m8-8H4"
          />
        </svg>
        <span className="text-xs font-medium">New</span>
      </button>

      {/* Keep active toggle - show when there are active sessions */}
      {activeSessionCount > 0 && (
        <button
          onClick={() => setKeepActive(!keepActive)}
          className={`
            flex items-center gap-1 px-1.5 py-0.5 rounded text-xxs
            transition-all duration-150
            ${keepActive
              ? 'bg-accent/10 text-accent'
              : 'bg-surface-2 text-text-tertiary hover:text-text-secondary'
            }
          `}
          title={keepActive ? 'Will keep current session active' : 'Will end current session'}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${keepActive ? 'bg-accent' : 'bg-text-tertiary'}`} />
          <span>Keep</span>
        </button>
      )}
    </div>
  );
}
