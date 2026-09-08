import { useCallback, useEffect } from 'react';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
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
import { LoadingSpinner, Tooltip } from '../ui';
import { toast } from '../../stores/toastStore';
import { getBaseName } from '../../utils/path';
import { findRetryMessage } from './retryMessage';

// Re-export components for use in Layout and other consumers
export { ChatHeader } from './ChatHeader';
export { SessionHistory } from './SessionHistory';
export { NewSessionButton } from './NewSessionButton';
export { SessionList } from './SessionList';

interface ChatProps {
  /** Current view mode for prompt customization (optional) */
  currentView?: ChatViewMode;
}

function ResourceIcon({ type }: { type: FocusedResource['type'] }) {
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
}

export function Chat({ currentView }: ChatProps) {
  const currentProjectId = useProjectDomainStore((state) => state.currentProjectId);
  const repos = useResourceDomainStore((state) => state.repos);
  const {
    focusedResources,
    addFocusedResource,
    removeFocusedResource,
    clearFocusedResources,
    setFocusedResources,
    syncFocusedResourcesForSession,
  } = useProjectUiDomainStore(
    useShallow((state) => ({
      focusedResources: state.focusedResources,
      addFocusedResource: state.addFocusedResource,
      removeFocusedResource: state.removeFocusedResource,
      clearFocusedResources: state.clearFocusedResources,
      setFocusedResources: state.setFocusedResources,
      syncFocusedResourcesForSession: state.syncFocusedResourcesForSession,
    }))
  );
  // Access per-session chat state
  const { viewedSessionId, viewedHydrated, retryMessage, error, mcpDegraded, mcpError, clearError, loadFromHistory } = useChatStore(useShallow((state) => {
    const session = state.viewedSessionId ? state.sessions.get(state.viewedSessionId) : null;
    return {
      viewedSessionId: state.viewedSessionId,
      viewedHydrated: session?.hydrated ?? true,
      // No retry offer while a turn is in flight: the last user message is
      // then the one being answered, not the one that failed, so retrying it
      // would resend the wrong text. This is the case a rejected live
      // follow-up produces, since its own bubble is pulled back out.
      retryMessage: session && !session.isStreaming ? findRetryMessage(session.messages) : undefined,
      error: session?.error ?? null,
      mcpDegraded: session?.mcpDegraded ?? false,
      mcpError: session?.mcpError ?? null,
      clearError: state.clearError,
      loadFromHistory: state.loadFromHistory,
    };
  }));

  // Lazy hydration: when a restored tab is focused for the first time, pull
  // its messages from the DB. Non-restored sessions are created with
  // hydrated:true and skip this round-trip.
  useEffect(() => {
    if (!currentProjectId || !viewedSessionId || viewedHydrated) return;
    void loadFromHistory(currentProjectId, viewedSessionId);
  }, [currentProjectId, viewedSessionId, viewedHydrated, loadFromHistory]);

  const { send, retry, cancel, cancelQueued } = useChat(currentProjectId, currentView);

  const handleSend = useCallback((message: string, attachments?: ChatAttachment[], chatSessionId?: string) => {
    const clientMessageId = crypto.randomUUID();
    const targetChatSessionId = chatSessionId ?? viewedSessionId;
    // Clear any stale error from a previous turn so it doesn't linger over the new send.
    if (targetChatSessionId) {
      clearError(targetChatSessionId);
    }
    void send(message, attachments, clientMessageId, chatSessionId);
  }, [send, clearError, viewedSessionId]);

  const handleRetry = useCallback(() => {
    if (retryMessage?.clientMessageId) {
      const message = retryMessage.segments
        .filter((segment) => segment.type === 'text')
        .map((segment) => segment.content)
        .join('');
      void retry(message, retryMessage.clientMessageId);
    }
  }, [retry, retryMessage]);

  // Clearing takes everything in one press, so the way back is offered rather
  // than a confirmation asked for. The restore is dropped if the user has moved
  // to another conversation in the meantime — context belongs to the session it
  // was gathered in, and putting it back somewhere else would be worse than
  // losing it.
  const handleClearContext = useCallback(() => {
    const cleared = focusedResources;
    if (cleared.length === 0) return;
    const clearedFrom = viewedSessionId;
    clearFocusedResources();
    toast.info('Context cleared', {
      label: 'Undo',
      onClick: () => {
        if (useChatStore.getState().viewedSessionId !== clearedFrom) return;
        setFocusedResources(cleared);
      },
    });
  }, [focusedResources, viewedSessionId, clearFocusedResources, setFocusedResources]);

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

  const hasFocus = focusedResources.length > 0;
  const focusCount = focusedResources.length;

  return (
    <div className="flex flex-col h-full min-h-0 bg-surface-1 overflow-x-hidden">
      {/* What the next turn is being pointed at. A band, not a highlight: it is
          always-on chrome rather than an action, so it is drawn with hairlines
          and the panel's own surface. Height animates to zero when empty so the
          transcript below never jumps. The borders come off with it — a 0px box
          with two hairlines is still a 2px line. */}
      <div
        className={`bg-surface-1 overflow-hidden transition-all duration-100 ease-out px-3 ${
          hasFocus ? 'border-y border-border-default' : ''
        }`}
        style={{
          height: hasFocus ? '36px' : '0px',
          paddingBlock: hasFocus ? '6px' : '0',
          opacity: hasFocus ? 1 : 0,
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Tooltip content="The agent sees these alongside your next message">
            <span className="font-mono text-tiny text-text-tertiary flex-shrink-0">context</span>
          </Tooltip>
          {focusCount > 1 && (
            <span className="text-xxs font-medium px-1.5 py-0.5 rounded-full bg-surface-3 text-text-secondary flex-shrink-0">
              {focusCount}
            </span>
          )}
          <div className="flex-1 flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-none">
            {focusedResources.map((resource, idx) => (
              // The chip body is inert: only the trailing control removes the
              // resource, so brushing a chip can't silently drop context.
              <Tooltip key={`${resource.type}-${idx}`} content={getResourceLabel(resource)}>
                <span className="text-xs text-text-primary bg-surface-3 pl-1.5 pr-0.5 py-0.5 rounded-sm flex items-center gap-1 max-w-[140px] transition-colors flex-shrink-0">
                  <ResourceIcon type={resource.type} />
                  <span className="truncate">{getResourceLabel(resource)}</span>
                  <button
                    onClick={() => removeFocusedResource(resource)}
                    className="p-0.5 rounded-sm text-text-muted hover:text-text-primary hover:bg-surface-4 transition-colors flex-shrink-0"
                    aria-label={`Remove ${getResourceLabel(resource)} from context`}
                  >
                    <CloseIcon className="w-2.5 h-2.5" />
                  </button>
                </span>
              </Tooltip>
            ))}
          </div>
          <Tooltip content="Clear all">
            <button
              onClick={handleClearContext}
              className="transition-colors flex-shrink-0 text-text-muted hover:text-text-primary hover:bg-surface-3 p-1 rounded-sm"
              aria-label="Clear all context"
            >
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Session-wide degradation stays as chrome because it outlives any one
          turn. A failed turn does not: it renders inside the transcript, at
          the message it belongs to. */}
      {mcpDegraded && (
        <div className="bg-warning-muted px-3 py-2" role="status">
          <p className="flex items-start gap-2 text-sm text-warning">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{mcpError ?? 'Plan, search, and repo tools are offline, so answers will not see your plan. Reconnecting.'}</span>
          </p>
        </div>
      )}

      {viewedHydrated ? (
        <MessageList
          key={viewedSessionId ?? 'no-session'}
          onCancelQueued={cancelQueued}
          error={error}
          onRetry={retryMessage ? handleRetry : undefined}
          onDismissError={() => viewedSessionId && clearError(viewedSessionId)}
        />
      ) : (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="flex items-center gap-2 text-text-muted">
            <LoadingSpinner className="w-4 h-4" />
            <span className="text-sm">Loading conversation</span>
          </div>
        </div>
      )}
      <ChatInput
        onSend={handleSend}
        onCancel={cancel}
        disabled={!currentProjectId}
        addFocusedResource={addFocusedResource}
      />
    </div>
  );
}
