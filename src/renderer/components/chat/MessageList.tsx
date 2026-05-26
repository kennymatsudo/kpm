import { useEffect, useRef, memo, useState, useMemo, useCallback, useLayoutEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore, type Activity, type MessageSegment } from '../../stores';
import type { Message } from '../../stores/chat';
import type { ChatViewMode } from '../../../shared/types';
import { processMessageContent } from '../../utils/messageFormatter';
import { Markdown } from 'markdown-to-jsx';
import { markdownOptions, transformPlanRefs } from '../../utils/markdown';
import { CopyIcon, CheckIcon } from '../icons';
import { ProcessTimeline } from './ProcessTimeline';
import { Tooltip } from '../ui/Tooltip';
import { AttachmentChip } from './AttachmentChip';
import { formatModel } from '../../utils/usageFormatters';

/** Extract text content from message segments for copy/display */
function getTextContent(segments: MessageSegment[]): string {
  return segments
    .filter((s): s is { type: 'text'; content: string } => s.type === 'text')
    .map((s) => s.content)
    .join('');
}

type SegmentGroup =
  | { kind: 'process'; segments: MessageSegment[] }

/**
 * Split segments into ordered runs separated by text. Each text segment becomes
 * its own group; activity/thinking segments coalesce into a single process
 * group until the next text breaks the run. This is what lets a single
 * assistant turn render as alternating tool blocks and prose.
 */
  const groups: SegmentGroup[] = [];
  let buffer: MessageSegment[] = [];

  const flushProcess = () => {
    if (buffer.length === 0) return;
    const hasContent = buffer.some(
      (s) =>
        (s.type === 'thinking' && s.content.trim().length > 0) ||
        (s.type === 'activity' && s.activities.length > 0)
    );
    if (hasContent) {
      groups.push({ kind: 'process', segments: buffer });
    }
    buffer = [];
  };

  for (const seg of segments) {
    if (seg.type === 'text') {
      flushProcess();
      if (seg.content.trim().length > 0) {
        groups.push({ kind: 'text', content: seg.content });
      }
    } else {
      buffer.push(seg);
    }
  }
  flushProcess();
  return groups;
}


/** Parse user message to extract image attachments and clean content */
function parseUserMessage(content: string): { cleanContent: string; imageCount: number } {
  const imagePrefix = /^Images attached \(use Read tool to view\):\n((?:- [^\n]+\n)+)\n/;
  const match = imagePrefix.exec(content);

  if (match) {
    const imageLines = match[1].trim().split('\n');
    const imageCount = imageLines.length;
    const cleanContent = content.slice(match[0].length);
    return { cleanContent, imageCount };
  }

  return { cleanContent: content, imageCount: 0 };
}

const PlanUpdateIndicator = memo(function PlanUpdateIndicator() {
  return (
    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border-subtle">
      <div className="w-1.5 h-1.5 rounded-full bg-info animate-pulse" />
      <span className="text-xs text-info">Plan update proposed</span>
    </div>
  );
});

/** Copy button that appears on hover */
const CopyButton = memo(function CopyButton({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Tooltip content={copied ? 'Copied!' : 'Copy message'} side="top">
      <button
        onClick={handleCopy}
        className={
          className ??
          'absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-surface-3 text-text-muted hover:text-text-primary'
        }
        aria-label={copied ? 'Message copied' : 'Copy message'}
      >
        {copied ? (
          <CheckIcon className="w-3.5 h-3.5 text-success" />
        ) : (
          <CopyIcon className="w-3.5 h-3.5" />
        )}
      </button>
    </Tooltip>
  );
});

const StreamingHeader = memo(function StreamingHeader({
  model,
  elapsedSeconds,
}: {
  model?: string;
  elapsedSeconds: number | null;
}) {
  const durationMs = elapsedSeconds != null ? elapsedSeconds * 1000 : undefined;
  return (
    <MessageHeader
      isUser={false}
      timestamp={new Date()}
      model={model}
      durationMs={durationMs}
    />
  );
});

const ThinkingIndicator = memo(function ThinkingIndicator({
  thinkingContent,
  activities,
  elapsedSeconds,
  model,
}: {
  thinkingContent?: string;
  activities: Activity[];
  elapsedSeconds: number | null;
  model?: string;
}) {
  return (
      <div className="pr-2">
        <ProcessTimeline
          streamingThinking={thinkingContent}
          streamingActivities={activities}
          isStreaming
          elapsedSeconds={elapsedSeconds}
        />
      </div>
    </div>
  );
});

const PLAN_EMPTY_STATE = {
  title: 'What needs to get done?',
  suggestions: [
    'Create or update tickets',
    'Ask what to prioritize next',
    'Break a feature into tasks',
  ],
  hint: 'Tasks sync to your tracker when ready',
};

const PlanEmptyState = memo(function PlanEmptyState() {
  return (
      <div className="w-12 h-12 rounded bg-accent/10 flex items-center justify-center mb-5">
        <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <h2 className="text-text-primary text-base font-medium mb-4">{PLAN_EMPTY_STATE.title}</h2>
      <ul className="text-text-secondary text-sm space-y-2.5 mb-5">
        {PLAN_EMPTY_STATE.suggestions.map((suggestion, idx) => (
          <li key={idx} className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent/40 flex-shrink-0" />
            {suggestion}
          </li>
        ))}
      </ul>
      <p className="text-text-muted text-xs">{PLAN_EMPTY_STATE.hint}</p>
    </div>
  );
});

const InterruptedIndicator = memo(function InterruptedIndicator() {
  return (
    <div
      className="flex items-center gap-2 mt-3 pt-3 border-t border-border-subtle"
      aria-label="Response was interrupted"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />
      <span className="text-xs text-text-muted italic">Interrupted</span>
    </div>
  );
});

/** Render assistant message segments within a single bubble */
const AssistantMessageContent = memo(function AssistantMessageContent({
  segments,
  interrupted,
}: {
  segments: MessageSegment[];
  interrupted?: boolean;
}) {
  const fullText = useMemo(() => getTextContent(segments), [segments]);
  const processed = useMemo(() => processMessageContent(fullText), [fullText]);

  return (
    <>
      {groups.map((group, idx) => {
        if (group.kind === 'process') {
          return <ProcessTimeline key={`p-${idx}`} segments={group.segments} />;
        }
        const segmentProcessed = processMessageContent(group.content);
        return (
          <div key={`t-${idx}`} className="prose-themed">
            <Markdown options={markdownOptions}>
              {transformPlanRefs(segmentProcessed.displayContent)}
            </Markdown>
          </div>
        );
      })}
      <CopyButton content={processed.displayContent} />
      {interrupted && <InterruptedIndicator />}
      {processed.hasPlanUpdate && <PlanUpdateIndicator />}
    </>
  );
});

/** Render streaming segments within a single bubble */
const StreamingContent = memo(function StreamingContent({
  segments,
  thinkingContent,
  activities,
  elapsedSeconds,
}: {
  segments: MessageSegment[];
  thinkingContent?: string;
  activities: Activity[];
  elapsedSeconds: number | null;
}) {

  // The "active" group — the one still receiving live activities/thinking — is
  // either the trailing process group (if no text has landed after the latest
  // tool batch) or a synthetic block appended after a trailing text segment.
  // Earlier process groups auto-collapse via ProcessTimeline's isStreaming flag.
  type RenderItem =
    | { kind: 'process'; segments: MessageSegment[]; isActive: boolean; liveActivities?: Activity[]; thinking?: string }
    | { kind: 'text'; content: string };

  const items: RenderItem[] = groups.map((g) =>
    g.kind === 'process'
      ? { kind: 'process', segments: g.segments, isActive: false }
      : { kind: 'text', content: g.content }
  );

  const lastIdx = items.length - 1;
  const last = items[lastIdx];
  const liveThinking = thinkingContent?.trim() ? thinkingContent : undefined;
  const hasLive = activities.length > 0 || !!liveThinking;

  let activeIdx = -1;
  if (last?.kind === 'process') {
    activeIdx = lastIdx;
  } else if (hasLive) {
    items.push({ kind: 'process', segments: [], isActive: true });
    activeIdx = items.length - 1;
  }

  if (activeIdx !== -1) {
    const active = items[activeIdx] as Extract<RenderItem, { kind: 'process' }>;
    active.isActive = true;
    if (activities.length > 0) active.liveActivities = activities;
  }

  // Streaming thinking has no temporal anchor (it accumulates as one blob),
  // so attach it to the first process group — matches the prior "thinking
  // surfaces at the top" behavior.
  if (liveThinking) {
    const firstProcess = items.find(
      (i): i is Extract<RenderItem, { kind: 'process' }> => i.kind === 'process'
    );
    if (firstProcess) firstProcess.thinking = liveThinking;
  }

  return (
    <>
      {items.map((item, idx) => {
        if (item.kind === 'process') {
          return (
            <ProcessTimeline
              key={`p-${idx}`}
              segments={item.segments}
              streamingActivities={item.liveActivities}
              streamingThinking={item.thinking}
              isStreaming={item.isActive}
              elapsedSeconds={item.isActive ? elapsedSeconds : null}
            />
          );
        }
        const processed = processMessageContent(item.content);
        return (
          <div key={`t-${idx}`} className="prose-themed">
            <Markdown options={markdownOptions}>
              {transformPlanRefs(processed.displayContent)}
            </Markdown>
          </div>
        );
      })}
    </>
  );
});

/** Format an HH:MM AM/PM timestamp for the message header. */
function formatClockTime(date: Date): string {
  const hours24 = date.getHours();
  const minutes = date.getMinutes();
  const isPm = hours24 >= 12;
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const mm = minutes < 10 ? `0${minutes}` : String(minutes);
  return `${hours12}:${mm} ${isPm ? 'PM' : 'AM'}`;
}

/** Format wall-clock duration with one decimal under a minute (e.g. "2.3s", "1m 5s"). */
function formatTurnDuration(ms: number | undefined): string | null {
  if (ms == null || ms < 0) return null;
  if (ms < 60_000) {
    const seconds = ms / 1000;
    return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
  }
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/** Friendly model label derived from the model id stamped on the message. */
function formatModelLabel(model: string | undefined): string | null {
  if (!model) return null;
  return formatModel(model).toLowerCase();
}

const MessageHeader = memo(function MessageHeader({
  isUser,
  timestamp,
  model,
  durationMs,
}: {
  isUser: boolean;
  timestamp: Date;
  model?: string;
  durationMs?: number;
}) {
  const name = isUser ? 'You' : 'KPM';
  const modelLabel = !isUser ? formatModelLabel(model) : null;
  const durationLabel = !isUser ? formatTurnDuration(durationMs) : null;

  return (
    <div className={`flex items-center gap-2 mb-1.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <span className="text-xs font-medium text-text-primary">{name}</span>
      {modelLabel && (
        <span className="font-mono text-xxs text-text-muted/80">{modelLabel}</span>
      )}
      {durationLabel && (
        <span className="font-mono text-xxs text-text-muted/60">· {durationLabel}</span>
      )}
      <span
        className={`font-mono text-xxs text-text-muted/50 ${isUser ? 'mr-auto' : 'ml-auto'}`}
      >
        {formatClockTime(timestamp)}
      </span>
    </div>
  );
});

const MessageRow = memo(function MessageRow({
  message,
  onCancelQueued,
}: {
  message: Message;
  onCancelQueued?: (clientMessageId: string) => void;
}) {
  const isUser = message.role === 'user';
  const textContent = useMemo(() => getTextContent(message.segments), [message.segments]);
  // Phase 2: prefer the structured `attachments` carried on the message; fall
  // back to legacy regex parsing only for older sessions that still carry the
  // "Images attached:" prefix (no longer emitted on send as of Phase 1).
  const hasStructuredAttachments = isUser && message.attachments && message.attachments.length > 0;
  const userParsed = useMemo(
    () => (isUser && !hasStructuredAttachments ? parseUserMessage(textContent) : null),
    [isUser, hasStructuredAttachments, textContent]
  );

  return (
    <div
      className={`py-3 group relative ${isUser ? 'chat-message-user' : 'chat-message-assistant'}`}
      aria-label={isUser ? 'Your message' : 'Assistant response'}
    >
      <MessageHeader
        isUser={isUser}
        timestamp={message.timestamp}
        model={message.model}
        durationMs={message.durationMs}
      />

      {/* Structured attachment chips (current-session messages) */}
      {hasStructuredAttachments && (
        <div
          className={`mb-1.5 flex flex-wrap gap-2 ${isUser ? 'justify-end' : ''}`}
        >
          {message.attachments!.map((attachment) => (
            <AttachmentChip
              key={attachment.path}
              attachment={attachment}
              thumbnailSize={40}
            />
          ))}
        </div>
      )}

      {/* Legacy fallback: count chip for old "Images attached:" prefixed messages */}
      {isUser && userParsed && userParsed.imageCount > 0 && (
        <div className="mb-1.5 flex justify-end">
          <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent-subtle text-accent text-xs rounded">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
              <path d="M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" />
              <path d="M2.002 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2h-12zm12 1a1 1 0 0 1 1 1v6.5l-3.777-1.947a.5.5 0 0 0-.577.093l-3.71 3.71-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12V3a1 1 0 0 1 1-1h12z" />
            </svg>
            <span>
              {userParsed.imageCount} image{userParsed.imageCount > 1 ? 's' : ''} attached
            </span>
          </div>
        </div>
      )}

      {/* pr-8 / pl-8 reserves space for the absolutely-positioned CopyButton */}
      <div
        className={`chat-message-content text-text-primary relative ${
          isUser ? 'pl-8 pr-0' : 'pl-0 pr-8'
        }`}
      >
        {isUser ? (
          <>
            <div className="flex justify-end">
              <div className="flex flex-col items-end max-w-[80%] gap-1">
                <div
                  className={`whitespace-pre-wrap text-right rounded-lg px-3 py-1.5 ${
                    message.queued
                      : 'bg-surface-2/60'
                  }`}
                >
                </div>
                  <div className="flex items-center gap-2 text-xxs text-text-muted">
                    <span className="inline-flex items-center gap-1">
                    </span>
                      <button
                        type="button"
                        onClick={() => onCancelQueued(message.clientMessageId!)}
                        className="underline hover:text-text-primary"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <CopyButton
              content={userParsed?.cleanContent || textContent}
              className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-surface-3 text-text-muted hover:text-text-primary"
            />
          </>
        ) : (
          <AssistantMessageContent
            segments={message.segments}
            interrupted={message.interrupted}
          />
        )}
      </div>
    </div>
  );
});

const ESTIMATED_MESSAGE_HEIGHT = 132;
const VIRTUAL_OVERSCAN_PX = 640;
const VIRTUALIZATION_MIN_MESSAGES = 40;
const INTERRUPTED_BANNER_DELAY_MS = 1200;

const VirtualizedMessageRow = memo(function VirtualizedMessageRow({
  message,
  top,
  onHeightChange,
  onCancelQueued,
}: {
  message: Message;
  top: number;
  onHeightChange: (id: string, height: number) => void;
  onCancelQueued?: (clientMessageId: string) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = rowRef.current;
    if (!element) return;

    const updateHeight = () => {
      onHeightChange(message.id, element.getBoundingClientRect().height);
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [message.id, onHeightChange]);

  return (
    <div
      ref={rowRef}
      className="absolute left-0 right-0"
      style={{ top }}
    >
      <MessageRow message={message} onCancelQueued={onCancelQueued} />
    </div>
  );
});

interface MessageListProps {
  currentView?: ChatViewMode;
  onCancelQueued?: (clientMessageId: string) => void;
}

export function MessageList({ currentView, onCancelQueued }: MessageListProps) {
  // Access per-session chat state
  const { viewedSession, viewedSessionId, model } = useChatStore(
        ? state.sessions.get(state.viewedSessionId) ?? null
  );

  const messages = viewedSession?.messages ?? [];
  const streamingSegments = viewedSession?.streamingSegments ?? [];
  const streamingContent = viewedSession?.streamingContent ?? '';
  const streamingThinking = viewedSession?.streamingThinking ?? '';
  const isStreaming = viewedSession?.isStreaming ?? false;
  const error = viewedSession?.error ?? null;
  const sessionState = viewedSession?.sessionState ?? 'idle';
  const activities = viewedSession?.activities ?? [];
  const streamStartedAt = viewedSession?.streamStartedAt ?? null;

  const listRef = useRef<HTMLDivElement>(null);
  const messageHeightsRef = useRef<Map<string, number>>(new Map());
  const isInitialMount = useRef(true);
  const prevMessagesRef = useRef(messages);
  const prevStreamingContentRef = useRef(streamingContent);
  const prevStreamingThinkingRef = useRef(streamingThinking);
  const prevStreamingSegmentsLenRef = useRef(streamingSegments.length);
  const prevActivitiesLenRef = useRef(activities.length);
  const [autoFollow, setAutoFollow] = useState(true);
  const [hasUnseenMessages, setHasUnseenMessages] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [measurementVersion, setMeasurementVersion] = useState(0);
  const [timeNow, setTimeNow] = useState(() => Date.now());
  const [showInterruptedBanner, setShowInterruptedBanner] = useState(false);
  const interruptedBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => setTimeNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  const elapsedSeconds = useMemo(() => {
    if (!streamStartedAt) return null;
    return Math.max(0, Math.floor((timeNow - streamStartedAt) / 1000));
  }, [streamStartedAt, timeNow]);

  const interruptedCandidate =
    !isStreaming &&
    !error &&
    sessionState !== 'ready' &&
    messages.length > 0 &&
    messages[messages.length - 1].role === 'user';

  useEffect(() => {
    if (interruptedBannerTimerRef.current) {
      clearTimeout(interruptedBannerTimerRef.current);
      interruptedBannerTimerRef.current = null;
    }

    if (!interruptedCandidate) {
      setShowInterruptedBanner(false);
      return;
    }

    interruptedBannerTimerRef.current = setTimeout(() => {
      setShowInterruptedBanner(true);
      interruptedBannerTimerRef.current = null;
    }, INTERRUPTED_BANNER_DELAY_MS);

    return () => {
      if (interruptedBannerTimerRef.current) {
        clearTimeout(interruptedBannerTimerRef.current);
        interruptedBannerTimerRef.current = null;
      }
    };
  }, [interruptedCandidate, viewedSessionId]);

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    const list = listRef.current;
    if (!list) return;
    if (behavior === 'auto') {
      setScrollTop(Math.max(0, list.scrollHeight - list.clientHeight));
    }
    list.scrollTo({ top: list.scrollHeight, behavior });
  };

  const isNearBottom = () => {
    const list = listRef.current;
    if (!list) return true;
    const threshold = 48;
    return list.scrollHeight - (list.scrollTop + list.clientHeight) <= threshold;
  };

  const handleScroll = () => {
    const list = listRef.current;
    if (list) {
      setScrollTop(list.scrollTop);
    }
    const nearBottom = isNearBottom();
    if (nearBottom) {
      if (!autoFollow) setAutoFollow(true);
      if (hasUnseenMessages) setHasUnseenMessages(false);
      return;
    }
    if (autoFollow) {
      setAutoFollow(false);
    }
  };

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const updateViewport = () => {
      setViewportHeight(list.clientHeight);
    };

    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  const handleMessageHeightChange = useCallback((id: string, height: number) => {
    const roundedHeight = Math.ceil(height);
    const previousHeight = messageHeightsRef.current.get(id);
    if (previousHeight === roundedHeight) return;
    messageHeightsRef.current.set(id, roundedHeight);
    setMeasurementVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    let removedAny = false;
    const messageIds = new Set(messages.map((message) => message.id));

    for (const existingId of messageHeightsRef.current.keys()) {
      if (!messageIds.has(existingId)) {
        messageHeightsRef.current.delete(existingId);
        removedAny = true;
      }
    }

    if (removedAny) {
      setMeasurementVersion((version) => version + 1);
    }
  }, [messages]);

  const { totalStaticHeight, virtualizedMessages } = useMemo(() => {
    let runningTop = 0;
    const measurements = staticMessages.map((message) => {
      const measuredHeight = messageHeightsRef.current.get(message.id) ?? ESTIMATED_MESSAGE_HEIGHT;
      const item = {
        message,
        top: runningTop,
        height: measuredHeight,
      };
      runningTop += measuredHeight;
      return item;
    });

    // For smaller conversations (or before viewport dimensions are reliable),
    // render all rows to avoid clipped/missing messages from virtualization math.
    const shouldVirtualize =
      viewportHeight > 0
      && staticMessages.length >= VIRTUALIZATION_MIN_MESSAGES
      && !isInitialMount.current;
    if (!shouldVirtualize) {
      return {
        totalStaticHeight: runningTop,
        virtualizedMessages: measurements,
      };
    }

    const visibleTop = Math.max(0, scrollTop - VIRTUAL_OVERSCAN_PX);
    const visibleBottom = scrollTop + viewportHeight + VIRTUAL_OVERSCAN_PX;
    const visibleItems = measurements.filter(
      (item) => item.top + item.height >= visibleTop && item.top <= visibleBottom
    );

    return {
      totalStaticHeight: runningTop,
      virtualizedMessages: visibleItems,
    };
  }, [staticMessages, measurementVersion, scrollTop, viewportHeight]);

  // Smart autoscroll:
  // - Follow while user is at bottom
  // - Stop following when user scrolls up
  // - Show "Jump to latest" when detached and new content arrives
  // - Always re-snap to bottom when the user sends a message, even if scrolled up
  useLayoutEffect(() => {
    const snapshotPrev = () => {
      prevMessagesRef.current = messages;
      prevStreamingContentRef.current = streamingContent;
      prevStreamingThinkingRef.current = streamingThinking;
      prevStreamingSegmentsLenRef.current = streamingSegments.length;
      prevActivitiesLenRef.current = activities.length;
    };

    if (isInitialMount.current) {
      scrollToBottom('auto');
      isInitialMount.current = false;
      snapshotPrev();
      return;
    }

    const prevMessages = prevMessagesRef.current;
    const userJustSent =
      messages.length > prevMessages.length &&
      messages[messages.length - 1]?.role === 'user';

    if (userJustSent) {
      snapshotPrev();
      if (!autoFollow) setAutoFollow(true);
      if (hasUnseenMessages) setHasUnseenMessages(false);
      scrollToBottom('smooth');
      return;
    }

    if (autoFollow) {
      // Use smooth scroll only when new content arrived — not for layout reflows
      // (e.g. container resize on view switch, editor panel opening/closing).
      const isNewContent =
        messages !== prevMessagesRef.current ||
        streamingContent !== prevStreamingContentRef.current ||
        streamingThinking !== prevStreamingThinkingRef.current ||
        streamingSegments.length !== prevStreamingSegmentsLenRef.current ||
        activities.length !== prevActivitiesLenRef.current;
      snapshotPrev();
      scrollToBottom(isStreaming || !isNewContent ? 'auto' : 'smooth');
      return;
    }

    setHasUnseenMessages(true);
  }, [
    messages,
    streamingContent,
    streamingThinking,
    streamingSegments.length,
    activities.length,
    autoFollow,
    isStreaming,
    measurementVersion,
    hasUnseenMessages,
  ]);

  if (messages.length === 0 && !isStreaming) {
    return currentView === 'plan' ? <PlanEmptyState /> : <div className="flex-1 min-h-0" />;
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 py-3"
        style={{ scrollbarGutter: 'stable' }}
      >
        <div className="relative" style={{ height: totalStaticHeight }}>
          {virtualizedMessages.map(({ message, top }) => (
            <VirtualizedMessageRow
              key={message.id}
              message={message}
              top={top}
              onHeightChange={handleMessageHeightChange}
              onCancelQueued={onCancelQueued}
            />
          ))}
        </div>

        {/* Interrupted response indicator — only show when session is disconnected (genuinely interrupted),
            not after tool-only responses that completed normally without text output */}
        {showInterruptedBanner && (
          <div className="flex items-center gap-2 py-3 text-text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />
            <span className="text-xs">Response was interrupted — send a message to continue</span>
          </div>
        )}

        {isStreaming && (streamingSegments.length > 0 || streamingContent) && (
            <div className="pr-2 chat-message-content text-text-primary">
              <StreamingContent
                segments={streamingSegments}
                thinkingContent={streamingThinking || undefined}
                activities={activities}
                elapsedSeconds={elapsedSeconds}
              />
            </div>
          </div>
        )}

        {/* Waiting for response (no content yet).
            Also keep the thinking indicator visible during brief session interruptions
            while we are still waiting on an assistant reply. */}
        {((isStreaming && streamingSegments.length === 0 && !streamingContent)
          || (!isStreaming && interruptedCandidate && !showInterruptedBanner)) && (
          <ThinkingIndicator
            thinkingContent={streamingThinking || undefined}
            activities={activities}
            elapsedSeconds={elapsedSeconds}
            model={model}
          />
        )}

      </div>

      {!autoFollow && (
        <div className="absolute bottom-3 right-4 pointer-events-none">
          <button
            onClick={() => {
              scrollToBottom('smooth');
              setAutoFollow(true);
              setHasUnseenMessages(false);
            }}
            className="pointer-events-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-3/95 border border-border-default shadow-md text-xs text-text-primary hover:bg-surface-3 transition-colors"
            title="Jump to latest messages"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7-7-7m7 7V3"
              />
            </svg>
            <span>{hasUnseenMessages ? 'Jump to latest' : 'Latest'}</span>
            {hasUnseenMessages && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
