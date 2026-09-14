import { useEffect, useRef, useState } from 'react';
import { useChatStore, usePermissionStore, useProjectDomainStore } from '../../stores';
import type { Message, PerSessionState } from '../../stores/chat/types';
import { cancelChatSession, disconnectChatSession } from '../../services/chatService';
import { useShallow } from 'zustand/react/shallow';
import { CloseIcon } from '../icons';
import { Tooltip } from '../ui/Tooltip';
import { getProviderCapabilities } from '../../../shared/providerCapabilities';
import { sharedLeadingPrefix, stripSharedPrefix } from './sessionTabLabels';

/** Width of the fade that stands in for a scrollbar the strip deliberately hides. */
const EDGE_FADE = '20px';

/** First user message text, used as the tab label before a provider summary exists. */
function firstUserMessageText(messages: Message[] | undefined): string | null {
  const firstUser = messages?.find((message) => message.role === 'user');
  const textSegment = firstUser?.segments.find((segment) => segment.type === 'text');
  if (textSegment?.type !== 'text') return null;
  const normalized = textSegment.content.replace(/\s+/g, ' ').trim();
  return normalized || null;
}

/** The provider's own summary, for the providers that write one. */
function summaryTitle(session: Pick<PerSessionState, 'choice' | 'title'> | undefined): string | null {
  const provider = session?.choice?.selected.provider;
  if (!provider) return null;
  return getProviderCapabilities(provider).sessionSummaries ? session.title : null;
}

/**
 * Session tabs showing all active and recent sessions.
 * Allows switching between sessions and closing them.
 */
export function SessionList() {
  const { currentProjectId } = useProjectDomainStore(useShallow((state) => ({
    currentProjectId: state.currentProjectId,
  })));

  const sessionIds = useChatStore(useShallow((state) =>
    Array.from(state.sessions.entries())
      .sort((a, b) => a[1].sessionNumber - b[1].sessionNumber)
      .map(([id]) => id)
  ));

  // Decided once for the whole strip so every fallback title is cut from the
  // same place; a tab that already carries a provider summary is left out of
  // the reckoning and keeps its own words.
  const sharedPrefix = useChatStore((state) => {
    const fallbacks: string[] = [];
    for (const session of state.sessions.values()) {
      if (summaryTitle(session)) continue;
      const firstMessage = firstUserMessageText(session.messages);
      if (firstMessage) fallbacks.push(firstMessage);
    }
    return sharedLeadingPrefix(fallbacks);
  });

  const stripRef = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState({ start: false, end: false });

  // The strip hides its scrollbar, so without a fade an off-screen session is
  // simply invisible — and arrow keys can select one.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const measure = () => {
      const overflowing = strip.scrollWidth - strip.clientWidth > 1;
      setClipped({
        start: overflowing && strip.scrollLeft > 1,
        end: overflowing && strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1,
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    strip.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer.disconnect();
      strip.removeEventListener('scroll', measure);
    };
  }, [sessionIds.length]);

  // Hide only when there are no sessions; with 1+ sessions, always render so the close affordance is available.
  if (sessionIds.length === 0) {
    return null;
  }

  const fadeMask = clipped.start || clipped.end
    ? `linear-gradient(to right, transparent 0, #000 ${clipped.start ? EDGE_FADE : '0px'}, ` +
      `#000 calc(100% - ${clipped.end ? EDGE_FADE : '0px'}), transparent 100%)`
    : undefined;

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label="Chat sessions"
      className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-none"
      style={{ maskImage: fadeMask, WebkitMaskImage: fadeMask }}
    >
      {sessionIds.map((sessionId, index) => (
        <SessionTab
          key={sessionId}
          sessionId={sessionId}
          currentProjectId={currentProjectId}
          siblingIds={sessionIds}
          index={index}
          sharedPrefix={sharedPrefix}
        />
      ))}
    </div>
  );
}

function SessionTab({
  sessionId,
  currentProjectId,
  siblingIds,
  index,
  sharedPrefix,
}: {
  sessionId: string;
  currentProjectId: string | null;
  siblingIds: string[];
  index: number;
  /** Opening words every fallback title shares, removed so the rest can be read. */
  sharedPrefix: string;
}) {
  const {
    summary,
    sessionNumber,
    firstMessage,
    isStreaming,
    hasBackgroundWork,
    isActive,
    isViewed,
    setViewedSession,
    removeSession,
  } = useChatStore(useShallow((state) => {
    const session = state.sessions.get(sessionId);
    return {
      summary: summaryTitle(session),
      sessionNumber: session?.sessionNumber ?? null,
      firstMessage: firstUserMessageText(session?.messages),
      isStreaming: session?.isStreaming ?? false,
      hasBackgroundWork: (session?.backgroundTasks.length ?? 0) > 0,
      isActive: state.activeSessionIds.has(sessionId),
      isViewed: state.viewedSessionId === sessionId,
      setViewedSession: state.setViewedSession,
      removeSession: state.removeSession,
    };
  }));

  // A prompt only renders inline for the viewed tab, so a background tab has
  // to say so itself or its turn just looks stalled.
  const isAwaitingPermission = usePermissionStore(
    (state) => (state.pendingRequests.get(sessionId)?.length ?? 0) > 0,
  );

  const tabRef = useRef<HTMLDivElement>(null);

  // Selecting a tab that sits past the fade has to bring it back into view;
  // arrow keys walk the whole list, not just the visible part.
  useEffect(() => {
    if (isViewed) {
      tabRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [isViewed]);

  if (sessionNumber === null) {
    return null;
  }

  // Prefer the provider's auto-summary; before it exists (or for providers
  // without summaries) fall back to the first user message, matching SessionHistory.
  const displayTitle = summary ?? firstMessage;

  const closeSession = async () => {
    if (!currentProjectId) return;

    // If streaming, cancel first (interrupt with timeout + force-disconnect fallback)
    if (isActive && isStreaming) {
      await cancelChatSession(currentProjectId, sessionId);
    }

    // Always call disconnect — streaming-layer cleanup is idempotent for
    // inactive sessions, ensuring any active subprocess is torn down cleanly.
    await disconnectChatSession(currentProjectId, sessionId);

    // Remove session entirely (handles view switching internally)
    removeSession(sessionId);
  };

  const label = displayTitle ?? `Session ${sessionNumber}`;
  // A summary is already written to be told apart; only the borrowed opening
  // of a first message gets trimmed, and the untrimmed words stay on the tab's
  // tooltip and in its name.
  const shortLabel = summary === null && firstMessage
    ? stripSharedPrefix(firstMessage, sharedPrefix)
    : label;
  // Background work outlives the turn that started it, so a session can still
  // be busy with no response streaming. Both spin; only the answer-in-progress
  // one is accented, so the tab distinguishes "talking to you" from "still
  // working" without a second mark.
  const isBusy = isActive && (isStreaming || hasBackgroundWork);
  const showAwaitingMark = isAwaitingPermission && !isViewed;
  const stateLabel = showAwaitingMark
    ? 'waiting for your approval'
    : isActive
      ? isStreaming ? 'responding' : hasBackgroundWork ? 'running in background' : 'active'
      : 'idle';

  // Arrow keys move between tabs and Delete closes one, so a keyboard user
  // never has to reach a 30px target with the mouse. Only the selected tab is
  // a tab stop, per the standard tablist pattern.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step !== 0) {
      e.preventDefault();
      const next = siblingIds[(index + step + siblingIds.length) % siblingIds.length];
      if (next) setViewedSession(next);
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const target = e.key === 'Home' ? siblingIds[0] : siblingIds[siblingIds.length - 1];
      if (target) setViewedSession(target);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      void closeSession();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setViewedSession(sessionId);
    }
  };

  return (
    <div
      ref={tabRef}
      role="tab"
      tabIndex={isViewed ? 0 : -1}
      aria-selected={isViewed}
      aria-label={`${label}, ${stateLabel}`}
      onClick={() => setViewedSession(sessionId)}
      onKeyDown={handleKeyDown}
      className={`
        group flex h-7 items-center gap-1.5 pl-2 pr-1 rounded-sm text-xs cursor-pointer
        transition-colors duration-150 min-w-[116px] max-w-[288px]
        focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent
        ${isViewed
          ? 'bg-surface-selected text-text-primary font-medium'
          : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-2'
        }
      `}
    >
      {/* Fixed box so the tab does not shift by 4px when a turn starts or ends.
          Status is also in the tab's accessible name, so the mark never carries
          the meaning on its own. Idle is hollow: nothing is running. */}
      <span className="flex w-3 h-3 items-center justify-center flex-shrink-0" aria-hidden="true">
        {showAwaitingMark ? (
          <span className="w-2 h-2 rounded-full bg-warning" />
        ) : isBusy ? (
          <svg
            className={`w-3 h-3 animate-spin ${isStreaming ? 'text-accent' : 'text-text-tertiary'}`}
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : isActive ? (
          <span className="w-2 h-2 rounded-full bg-success" />
        ) : (
          <span className="w-2 h-2 rounded-full border border-border-strong" />
        )}
      </span>

      {/* Session name: provider summary when available, fall back to "Session N". */}
      {displayTitle ? (
        <Tooltip content={<span className="block max-w-[280px]">{label}</span>} side="bottom">
          <span className="flex-1 min-w-0 truncate">{shortLabel}</span>
        </Tooltip>
      ) : (
        <span className="flex-1 min-w-0 truncate">{label}</span>
      )}

      {/* Reserved width, revealed on the selected tab and on hover, so a resting
          strip is titles only and nothing reflows when the pointer arrives.
          Not a tab stop: a tab must not contain focusable children, and Delete
          already closes the session from the keyboard. The label names the
          consequence, which is the only warning a live session gets. */}
      <Tooltip content={isStreaming ? 'Close session and stop the running response' : 'Close session'}>
        <button
          onClick={(e) => { e.stopPropagation(); void closeSession(); }}
          tabIndex={-1}
          className={`
            p-0.5 rounded-sm flex-shrink-0 transition-opacity duration-150
            text-text-muted hover:text-danger group-hover:opacity-100
            ${isViewed ? 'opacity-100' : 'opacity-0'}
          `}
          aria-label={
            isStreaming
              ? `Close ${label} and stop the running response`
              : `Close ${label}`
          }
        >
          <CloseIcon className="w-3 h-3" />
        </button>
      </Tooltip>
    </div>
  );
}
