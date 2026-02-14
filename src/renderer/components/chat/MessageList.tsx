import { useChatStore, type Activity, type MessageSegment } from '../../stores';
import { processMessageContent } from '../../utils/messageFormatter';
import { CopyIcon, CheckIcon } from '../icons';

/** Extract text content from message segments for copy/display */
function getTextContent(segments: MessageSegment[]): string {
  return segments
    .filter((s): s is { type: 'text'; content: string } => s.type === 'text')
    .map((s) => s.content)
    .join('');
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
  );
});

const ThinkingIndicator = memo(function ThinkingIndicator({
  activities,
  elapsedSeconds,
}: {
  activities: Activity[];
  elapsedSeconds: number | null;
}) {
  return (
    </div>
  );
});

};

  return (
      <div className="w-12 h-12 rounded bg-accent/10 flex items-center justify-center mb-5">
        <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <ul className="text-text-secondary text-sm space-y-2.5 mb-5">
          <li key={idx} className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent/40 flex-shrink-0" />
            {suggestion}
          </li>
        ))}
      </ul>
    </div>
  );
});

/** Render assistant message segments within a single bubble */
const AssistantMessageContent = memo(function AssistantMessageContent({
  segments,
}: {
  segments: MessageSegment[];
}) {
  const fullText = useMemo(() => getTextContent(segments), [segments]);
  const processed = useMemo(() => processMessageContent(fullText), [fullText]);

  return (
    <>
        return (
            </Markdown>
          </div>
        );
      })}
      <CopyButton content={processed.displayContent} />
      {processed.hasPlanUpdate && <PlanUpdateIndicator />}
    </>
  );
});

/** Render streaming segments within a single bubble */
const StreamingContent = memo(function StreamingContent({
  segments,
  activities,
  elapsedSeconds,
}: {
  segments: MessageSegment[];
  activities: Activity[];
  elapsedSeconds: number | null;
}) {
  return (
    <>
        return (
            </Markdown>
          </div>
        );
      })}
    </>
  );
});

const MessageRow = memo(function MessageRow({
  message,
}: {
  message: Message;
}) {
  const isUser = message.role === 'user';
  const textContent = useMemo(() => getTextContent(message.segments), [message.segments]);
  const userParsed = useMemo(
  );

  return (

        </div>
      </div>
    </div>
  );
});

const ESTIMATED_MESSAGE_HEIGHT = 132;
const VIRTUAL_OVERSCAN_PX = 640;

const VirtualizedMessageRow = memo(function VirtualizedMessageRow({
  message,
  top,
  onHeightChange,
}: {
  message: Message;
  top: number;
  onHeightChange: (id: string, height: number) => void;
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
    </div>
  );
});

interface MessageListProps {
  currentView?: ChatViewMode;
}

  // Access per-session chat state

  const messages = viewedSession?.messages ?? [];
  const streamingSegments = viewedSession?.streamingSegments ?? [];
  const streamingContent = viewedSession?.streamingContent ?? '';
  const isStreaming = viewedSession?.isStreaming ?? false;
  const error = viewedSession?.error ?? null;
  const sessionState = viewedSession?.sessionState ?? 'idle';
  const activities = viewedSession?.activities ?? [];
  const streamStartedAt = viewedSession?.streamStartedAt ?? null;
  const listRef = useRef<HTMLDivElement>(null);
  const messageHeightsRef = useRef<Map<string, number>>(new Map());
  const isInitialMount = useRef(true);
  const [autoFollow, setAutoFollow] = useState(true);
  const [hasUnseenMessages, setHasUnseenMessages] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [measurementVersion, setMeasurementVersion] = useState(0);
  const [timeNow, setTimeNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => setTimeNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    const list = listRef.current;
    if (!list) return;
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
      const measuredHeight = messageHeightsRef.current.get(message.id) ?? ESTIMATED_MESSAGE_HEIGHT;
      const item = {
        message,
        top: runningTop,
        height: measuredHeight,
      };
      runningTop += measuredHeight;
      return item;
    });

    const visibleTop = Math.max(0, scrollTop - VIRTUAL_OVERSCAN_PX);
    const visibleBottom = scrollTop + viewportHeight + VIRTUAL_OVERSCAN_PX;
    const visibleItems = measurements.filter(
      (item) => item.top + item.height >= visibleTop && item.top <= visibleBottom
    );

    return {
      totalStaticHeight: runningTop,
      virtualizedMessages: visibleItems,
    };

  // Smart autoscroll:
  // - Follow while user is at bottom
  // - Stop following when user scrolls up
  // - Show "Jump to latest" when detached and new content arrives
    if (isInitialMount.current) {
      scrollToBottom('auto');
      isInitialMount.current = false;
      return;
    }

    if (autoFollow) {
      return;
    }

    setHasUnseenMessages(true);

  if (messages.length === 0 && !isStreaming) {
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
            />
          ))}
        </div>

        {/* Interrupted response indicator — only show when session is disconnected (genuinely interrupted),
            not after tool-only responses that completed normally without text output */}
          <div className="flex items-center gap-2 py-3 text-text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />
            <span className="text-xs">Response was interrupted — send a message to continue</span>
          </div>
        )}

        {isStreaming && (streamingSegments.length > 0 || streamingContent) && (
              <StreamingContent
                segments={streamingSegments}
                activities={activities}
                elapsedSeconds={elapsedSeconds}
              />
            </div>
          </div>
        )}

          <ThinkingIndicator
            activities={activities}
            elapsedSeconds={elapsedSeconds}
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
