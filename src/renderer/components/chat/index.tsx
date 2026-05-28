import { useState, useCallback, useEffect } from 'react';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { SessionList } from './SessionList';
import { PermissionPrompt } from '../permission/PermissionPrompt';
import { useChat } from '../../hooks/useChat';
import {
  useProjectDomainStore,
  useProjectUiDomainStore,
  useResourceDomainStore,
  useChatStore,
  type ChatViewMode,
} from '../../stores';
import type { ChatAttachment, FocusedResource } from '../../../shared/types';
import { useShallow } from 'zustand/react/shallow';
import { CloseIcon } from '../icons';
import { getBaseName } from '../../utils/path';

// Re-export components for use in Layout and other consumers
export { ChatHeader } from './ChatHeader';
export { SessionHistory } from './SessionHistory';
export { NewSessionButton } from './NewSessionButton';
export { SessionList } from './SessionList';

interface ChatProps {
  /** Current view mode for prompt customization (optional) */
  currentView?: ChatViewMode;
}

export function Chat({ currentView }: ChatProps) {
  const currentProjectId = useProjectDomainStore((state) => state.currentProjectId);
  const repos = useResourceDomainStore((state) => state.repos);
  const {
    focusedResources,
    addFocusedResource,
    removeFocusedResource,
    clearFocusedResources,
    syncFocusedResourcesForSession,
  } = useProjectUiDomainStore(
    useShallow((state) => ({
      focusedResources: state.focusedResources,
      addFocusedResource: state.addFocusedResource,
      removeFocusedResource: state.removeFocusedResource,
      clearFocusedResources: state.clearFocusedResources,
      syncFocusedResourcesForSession: state.syncFocusedResourcesForSession,
    }))
  );
  // Access per-session chat state
  const { viewedSessionId, viewedSession, clearError, loadFromHistory } = useChatStore(useShallow((state) => {
    const session = state.viewedSessionId ? state.sessions.get(state.viewedSessionId) : null;
    return {
      viewedSessionId: state.viewedSessionId,
      viewedSession: session,
      clearError: state.clearError,
      loadFromHistory: state.loadFromHistory,
    };
  }));

  // Lazy hydration: when a restored tab is focused for the first time, pull
  // its messages from the DB. Non-restored sessions are created with
  // hydrated:true and skip this round-trip.
  const viewedHydrated = viewedSession?.hydrated ?? true;
  useEffect(() => {
    if (!currentProjectId || !viewedSessionId || viewedHydrated) return;
    void loadFromHistory(currentProjectId, viewedSessionId);
  }, [currentProjectId, viewedSessionId, viewedHydrated, loadFromHistory]);

  const error = viewedSession?.error ?? null;
  const mcpDegraded = viewedSession?.mcpDegraded ?? false;
  const mcpError = viewedSession?.mcpError ?? null;

  const { send, retry, cancel, cancelQueued } = useChat(currentProjectId, currentView);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [lastClientMessageId, setLastClientMessageId] = useState<string | null>(null);

  const handleSend = useCallback((message: string, attachments?: ChatAttachment[], chatSessionId?: string) => {
    const clientMessageId = crypto.randomUUID();
    // Clear any stale error from a previous turn so it doesn't linger over the new send.
    if (viewedSessionId) clearError(viewedSessionId);
    setLastMessage(message);
    setLastClientMessageId(clientMessageId);
    void send(message, attachments, clientMessageId, chatSessionId);
  }, [send, clearError, viewedSessionId]);

  const handleRetry = useCallback(() => {
    if (lastMessage && lastClientMessageId && viewedSessionId) {
      void retry(lastMessage, lastClientMessageId);
    }
  }, [lastMessage, lastClientMessageId, retry, viewedSessionId]);

  // Keep project store's visible focused resources aligned to the viewed chat session.
  useEffect(() => {
    syncFocusedResourcesForSession(viewedSessionId);
  }, [viewedSessionId, syncFocusedResourcesForSession]);

  // Helper to get display label for a focused resource
  const getResourceLabel = (resource: FocusedResource): string => {
    switch (resource.type) {
      case 'plan_item':
        return resource.title;
      case 'project_file':
        return getBaseName(resource.path, resource.path);
      case 'repo': {
        // If path is provided, show file name; otherwise show repo name from store
        if (resource.path) {
          return getBaseName(resource.path, resource.path);
        }
        const repo = repos.find((r) => r.id === resource.id);
        return repo ? getBaseName(repo.path, 'Repository') : 'Repository';
      }
      case 'document':
        return resource.title;
    }
  };

  // Helper to get icon for resource type
  const ResourceIcon = ({ type }: { type: FocusedResource['type'] }) => {
    const className = "w-3 h-3 flex-shrink-0 opacity-70";
    switch (type) {
      case 'plan_item':
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        );
      case 'project_file':
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        );
      case 'repo':
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        );
      case 'document':
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
    }
  };

  const hasFocus = focusedResources.length > 0;
  const focusCount = focusedResources.length;

  return (
    <div className="flex flex-col h-full min-h-0 bg-surface-1 overflow-x-hidden">
      {/* Session tabs */}
      <SessionList />

      {/* Focused resources banner - animated height to prevent layout shift */}
      <div
        className="bg-accent-subtle flex items-center gap-2 overflow-hidden transition-all duration-100 ease-out"
        style={{
          height: hasFocus ? '36px' : '0px',
          padding: hasFocus ? '8px 12px' : '0 12px',
          opacity: hasFocus ? 1 : 0,
        }}
      >
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
          <span className="text-xs font-medium whitespace-nowrap" style={{ color: 'var(--color-accent)' }}>
            Context
          </span>
          {focusCount > 1 && (
            <span className="text-xxs font-medium px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">
              {focusCount}
            </span>
          )}
        </div>
        <div className="flex-1 flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-none">
          {focusedResources.map((resource, idx) => (
            <button
              key={`${resource.type}-${idx}`}
              onClick={() => removeFocusedResource(resource)}
              className="text-xs text-text-primary bg-surface-2/60 hover:bg-surface-2 pl-1.5 pr-1 py-0.5 rounded-md flex items-center gap-1 max-w-[140px] group transition-colors flex-shrink-0"
              title={`Remove: ${getResourceLabel(resource)}`}
            >
              <ResourceIcon type={resource.type} />
              <span className="truncate">{getResourceLabel(resource)}</span>
              <CloseIcon className="w-2.5 h-2.5 flex-shrink-0 opacity-40 group-hover:opacity-100" />
            </button>
          ))}
        </div>
        <button
          onClick={clearFocusedResources}
          className="transition-colors flex-shrink-0 hover:bg-surface-2/50 p-1 rounded"
          style={{ color: 'color-mix(in srgb, var(--color-accent) 60%, transparent)' }}
          title="Clear all"
        >
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-danger-muted px-3 py-2 flex items-start gap-3">
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
            onClick={() => viewedSessionId && clearError(viewedSessionId)}
            className="text-danger/60 hover:text-danger transition-colors flex-shrink-0"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* MCP degraded warning banner — auto-clears when server reconnects */}
      {mcpDegraded && (
        <div className="bg-warning-muted px-3 py-2 flex items-center gap-3">
          <svg className="w-4 h-4 text-warning flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm text-warning">
            {mcpError ?? 'KPM tools are temporarily unavailable. Attempting to reconnect...'}
          </p>
        </div>
      )}

      <PermissionPrompt />
      <ChatInput
        onSend={handleSend}
        onCancel={cancel}
        disabled={!currentProjectId}
        addFocusedResource={addFocusedResource}
        currentView={currentView}
      />
    </div>
  );
}
