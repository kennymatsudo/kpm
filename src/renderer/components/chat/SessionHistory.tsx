import { useState, useEffect, useRef } from 'react';
import { useChatStore, useProjectDomainStore } from '../../stores';
import { useShallow } from 'zustand/react/shallow';
import { Z_INDEX } from '../../constants/zIndex';

/**
 * Session history dropdown showing recent chat sessions.
 */
export function SessionHistory() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { currentProjectId } = useProjectDomainStore(useShallow((state) => ({
    currentProjectId: state.currentProjectId,
  })));

  // Access per-session chat state
  const { sessionHistory, isStreaming, loadSessionHistory, loadFromHistory } = useChatStore(useShallow((state) => {
    const session = state.viewedSessionId ? state.sessions.get(state.viewedSessionId) : null;
    return {
      sessionHistory: state.sessionHistory,
      isStreaming: session?.isStreaming ?? false,
      loadSessionHistory: state.loadSessionHistory,
      loadFromHistory: state.loadFromHistory,
    };
  }));

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
        disabled={isStreaming}
        className={`
          flex items-center gap-1.5 px-2 py-1 rounded-lg
          transition-all duration-150
          ${isOpen
            ? 'bg-accent-subtle text-accent'
            : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-3'
          }
          disabled:opacity-40 disabled:cursor-not-allowed
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
                  >
            </div>
          )}
        </div>
      )}
    </div>
  );
}
