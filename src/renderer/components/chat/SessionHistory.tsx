import { useState, useEffect, useRef } from 'react';
import { useChatStore, useProjectDomainStore } from '../../stores';
import { useShallow } from 'zustand/react/shallow';
import { Z_INDEX } from '../../constants/zIndex';
import { formatRelativeTime } from '../../utils/relativeTime';
import { getProviderCapabilities } from '../../../shared/providerCapabilities';

/**
 * Session history dropdown showing recent chat sessions.
 * Positioned at the top of the chat panel with KPM-styled dropdown.
 */
export function SessionHistory() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { currentProjectId } = useProjectDomainStore(useShallow((state) => ({
    currentProjectId: state.currentProjectId,
  })));

  const { sessionHistory, loadSessionHistory, loadFromHistory } = useChatStore(useShallow((state) => ({
    sessionHistory: state.sessionHistory,
    loadSessionHistory: state.loadSessionHistory,
    loadFromHistory: state.loadFromHistory,
  })));

  // Load session history when dropdown opens
  useEffect(() => {
    if (isOpen && currentProjectId) {
      void loadSessionHistory(currentProjectId);
    }
  }, [isOpen, currentProjectId, loadSessionHistory]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleSessionClick = async (chatSessionId: string) => {
    if (!currentProjectId) return;
    const projectId = currentProjectId;
    await loadFromHistory(
      projectId,
      chatSessionId,
      () => useProjectDomainStore.getState().currentProjectId === projectId
    );
    setIsOpen(false);
  };

  const truncateMessage = (message: string | null, maxLength = 60) => {
    if (!message) return 'New conversation';
    // Clean up any image references from the message
    const cleaned = message.replace(/Images attached.*?\n\n/s, '').trim();
    if (cleaned.length <= maxLength) return cleaned;
    return cleaned.slice(0, maxLength).trim() + '...';
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button - subtle icon */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-1.5 px-2 py-1 rounded-lg
          transition-all duration-150
          ${isOpen
            ? 'bg-accent-subtle text-accent'
            : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-3'
          }
        `}
        title="Session history"
        aria-label="Session history"
        aria-expanded={isOpen}
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
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className="text-xs font-medium">History</span>
        <svg
          className={`w-3 h-3 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu - KPM styled */}
      {isOpen && (
        <div
          className="dropdown-menu absolute right-0 top-full mt-1.5 w-72"
          style={{
            zIndex: Z_INDEX.dropdown,
            boxShadow: 'var(--shadow-md)',
            border: '1px solid var(--color-border-default)',
          }}
        >
          {/* Header */}
          <div className="px-3 py-2.5 border-b" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Recent Sessions
              </span>
              {sessionHistory.length > 0 && (
                <span
                  className="text-xxs font-medium px-1.5 py-0.5 rounded-full"
                  style={{
                    background: 'var(--color-accent-subtle)',
                    color: 'var(--color-accent)'
                  }}
                >
                  {sessionHistory.length}
                </span>
              )}
            </div>
          </div>

          {/* Session list */}
          {sessionHistory.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <svg
                className="w-8 h-8 mx-auto mb-2 text-text-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <p className="text-sm text-text-tertiary">No previous sessions</p>
              <p className="text-xs text-text-muted mt-1">Start a conversation to see it here</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto py-1">
              {sessionHistory.map((session, index) => {
                const title = getProviderCapabilities(session.provider).sessionSummaries ? session.title : null;
                const primary = title ?? truncateMessage(session.first_message);
                const secondary = title ? truncateMessage(session.first_message, 50) : null;
                return (
                  <button
                    key={session.chat_session_id}
                    onClick={() => handleSessionClick(session.chat_session_id)}
                    className="dropdown-item w-full text-left group"
                    style={{
                      animationDelay: `${index * 30}ms`,
                      animationFillMode: 'backwards',
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      {/* Primary: title (or first message when no title yet) */}
                      <p className="text-sm text-text-primary truncate">
                        {primary}
                      </p>
                      {/* Secondary: compact meta line */}
                      <div className="flex items-center gap-1.5 mt-px text-xxs text-text-muted min-w-0">
                        {secondary && (
                          <>
                            <span className="truncate">{secondary}</span>
                            <span className="opacity-60 flex-shrink-0">·</span>
                          </>
                        )}
                        <span className="flex-shrink-0">{formatRelativeTime(session.last_activity)}</span>
                        <span className="opacity-60 flex-shrink-0">·</span>
                        <span className="flex-shrink-0">
                          {session.message_count} {session.message_count === 1 ? 'message' : 'messages'}
                        </span>
                      </div>
                    </div>
                    {/* Arrow indicator on hover */}
                    <svg
                      className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
