import {
  useEffect,
  useRef,
  memo,
  useState,
  useMemo,
  useCallback,
  useLayoutEffect,
  type ReactNode,
} from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore, usePermissionStore, type Activity, type MessageSegment } from '../../stores';
import type { Message } from '../../stores/chat';
import type { AgentBackgroundTask } from '../../../shared/types';
import { parseUserMessage } from '../../utils/messageFormatter';
import { Markdown } from 'markdown-to-jsx';
import {
  growingBlockMarkdownOptions,
  markdownOptions,
  transformPlanRefs,
} from '../../utils/markdown';
import { splitMarkdownBlocks } from '../../utils/markdownBlocks';
import { CopyIcon, CheckIcon, CloseIcon } from '../icons';
import { PermissionPrompt } from '../permission/PermissionPrompt';
import { ProcessTimeline } from './ProcessTimeline';
import { BackgroundTaskStrip } from './BackgroundTaskStrip';
import { Tooltip } from '../ui/Tooltip';
import { AttachmentChip } from './AttachmentChip';
import { formatModel } from '../../utils/usageFormatters';
import { buildTurnRenderPlan, type TurnRenderNode } from './turnRenderPlan';
import { sessionModelId } from '../../stores/chat/chatChoice';
import { canMergeAssistantTurn } from '../../stores/chat/messageMerge';
import { prefersReducedMotion } from '../../utils/reducedMotion';

/** Extract text content from message segments for copy/display */
function getTextContent(segments: MessageSegment[]): string {
  return segments
    .filter((s): s is { type: 'text'; content: string } => s.type === 'text')
    .map((s) => s.content)
    .join('');
}

/** Gap above which a checkpoint divider reads as "resumed after…" instead of "…later". */
const CHECKPOINT_GAP_DIVIDER_MS = 60_000;
/** Gaps shorter than this render no divider at all — not worth interrupting the flow for. */
const CHECKPOINT_GAP_MIN_MS = 1_500;

/** Muted inline divider marking a merged turn boundary — carries the "time is passing" signal that a repeated header used to provide. */
const CheckpointDivider = memo(function CheckpointDivider({ gapMs, model }: { gapMs: number | null; model?: string }) {
  const durationLabel = gapMs != null && gapMs >= CHECKPOINT_GAP_MIN_MS ? formatTurnDuration(gapMs) : null;
  const modelLabel = formatModelLabel(model);
  if (!durationLabel && !modelLabel) return null;
  const timeText = durationLabel
    ? gapMs != null && gapMs >= CHECKPOINT_GAP_DIVIDER_MS
      ? `resumed after ${durationLabel}`
      : `${durationLabel} later`
    : null;
  const text = [modelLabel, timeText].filter(Boolean).join(' · ');
  // Not aria-hidden: a mid-turn model switch is what explains a change in
  // tone, so it has to reach a screen reader too. The rules are decoration
  // and stay hidden.
  return (
    <div className="flex items-center gap-2 my-2 text-xs text-text-muted">
      <span className="flex-1 h-px bg-border-subtle" aria-hidden="true" />
      <span>{text}</span>
      <span className="flex-1 h-px bg-border-subtle" aria-hidden="true" />
    </div>
  );
});


/** Leading /name token (no '/' allowed inside, so paths like /Users/... never match) */
const COMMAND_TOKEN_PATTERN = /^\/([A-Za-z0-9_:-]+)(?=\s|$)/;

/** User message text, with a leading known slash command styled as a chip */
const UserMessageText = memo(function UserMessageText({ content }: { content: string }) {
  const slashCommands = useChatStore((state) => state.slashCommands);
  const match = COMMAND_TOKEN_PATTERN.exec(content);
  const command = match && slashCommands.some((c) => c.name === match[1]) ? match[1] : null;

  if (!command) return <>{content}</>;
  return (
    <>
      <span className="inline-flex items-baseline px-1.5 py-0.5 rounded-sm text-tiny font-mono font-medium bg-accent-subtle text-accent align-baseline">
        /{command}
      </span>
      {content.slice(command.length + 1)}
    </>
  );
});

const PlanUpdateIndicator = memo(function PlanUpdateIndicator() {
  return (
    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border-subtle">
      <div className="w-1.5 h-1.5 rounded-full bg-info animate-pulse" />
      <span className="text-xs text-info">Plan update proposed</span>
    </div>
  );
});

/** Hidden until the turn is hovered, but always in the caption's flow, so
 * revealing it never shifts the timestamp beside it. */
const CopyButton = memo(function CopyButton({ content }: { content: string }) {
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
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-0.5 rounded-sm hover:bg-surface-3 text-text-muted hover:text-text-primary"
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

/** The in-flight turn's header. Its clock reads the turn's start time, not
 * now — a header built from `new Date()` ticks forward while the turn streams
 * and then jumps backwards when the finalized message supplies its real
 * timestamp. */
const StreamingHeader = memo(function StreamingHeader({
  model,
  elapsedSeconds,
  startedAt,
}: {
  model?: string;
  elapsedSeconds: number | null;
  startedAt: number | null;
}) {
  const durationMs = elapsedSeconds != null ? elapsedSeconds * 1000 : undefined;
  const timestamp = useMemo(
    () => (startedAt != null ? new Date(startedAt) : new Date()),
    [startedAt]
  );
  return <AssistantCaption timestamp={timestamp} model={model} durationMs={durationMs} />;
});

const InterruptedIndicator = memo(function InterruptedIndicator() {
  return (
    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border-subtle">
      <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" aria-hidden="true" />
      <span className="text-xs text-text-secondary">
        You stopped this response. Work already done above was kept.
      </span>
    </div>
  );
});

/** A failed turn, rendered where it happened rather than as a banner pinned to
 * the top of the panel — the recovery action has to sit next to the message it
 * would resend. */
const TurnError = memo(function TurnError({
  error,
  onRetry,
  onDismiss,
}: {
  error: string;
  onRetry?: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="my-3 rounded-md border border-border-default bg-surface-elevated overflow-hidden"
    >
      <div className="flex items-start gap-2 px-3 py-2 bg-danger-muted border-b border-border-subtle">
        <svg
          className="w-4 h-4 text-danger flex-shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="flex-1 min-w-0 text-sm text-text-primary">This turn didn't finish.</p>
        <button
          onClick={onDismiss}
          className="text-text-muted hover:text-text-primary transition-colors flex-shrink-0 p-0.5 rounded-sm"
          aria-label="Dismiss error"
        >
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-xs text-text-secondary break-words">{error}</p>
        {onRetry && (
          <button onClick={onRetry} className="btn btn-secondary mt-2.5">
            Send it again
          </button>
        )}
      </div>
    </div>
  );
});

/** A finished answer: its caption, then its prose. The caption is built here
 * rather than by the row above, because the copy control belongs in it and
 * only the render plan knows what the answer's text actually is once plan
 * markers and process segments are stripped out. */
export const AssistantMessageContent = memo(function AssistantMessageContent({
  segments,
  interrupted,
  startTimestamp,
  durationMs,
  turnId,
  timestamp,
  model,
}: {
  segments: MessageSegment[];
  interrupted?: boolean;
  /** Namespaces the process strip's remembered open state. */
  turnId?: string;
  /** The message's own start time — anchors the gap shown by the first checkpoint divider. */
  startTimestamp?: number;
  /** Duration of the message's final turn; earlier turns carry theirs on the checkpoint that closed them. */
  durationMs?: number;
  /** Omitted when this turn is attached to the one above it as a continuation. */
  timestamp?: Date;
  model?: string;
}) {
  const plan = useMemo(
    () => buildTurnRenderPlan({ segments, startTimestamp, durationMs, turnId }),
    [segments, startTimestamp, durationMs, turnId]
  );

  return (
    <AssistantTurnContent
      nodes={plan.nodes}
      caption={
        timestamp && (
          <AssistantCaption
            timestamp={timestamp}
            model={model}
            durationMs={durationMs}
            copyContent={plan.copyText}
          />
        )
      }
    >
      {interrupted && <InterruptedIndicator />}
      {plan.hasPlanUpdate && <PlanUpdateIndicator />}
    </AssistantTurnContent>
  );
});

/** One blank-line-delimited markdown block. Memoized so a block whose text
 * hasn't changed since the last flush skips re-parsing — only the growing
 * tail block re-parses as streamed text appends. */
const MarkdownBlock = memo(function MarkdownBlock({
  block,
  growing,
}: {
  block: string;
  growing?: boolean;
}) {
  return (
    <Markdown options={growing ? growingBlockMarkdownOptions : markdownOptions}>
      {transformPlanRefs(block)}
    </Markdown>
  );
});

/** Markdown for a still-growing text group. Splits the accumulated content
 * into blocks and renders each through its own memoized `<Markdown>` call, so
 * a buffer flush re-parses only the tail block instead of the full string. */
const StreamingMarkdown = memo(function StreamingMarkdown({ content }: { content: string }) {
  const blocks = useMemo(() => splitMarkdownBlocks(content), [content]);

  return (
    <>
      {blocks.map((block, idx) => (
        <MarkdownBlock key={idx} block={block} growing={idx === blocks.length - 1} />
      ))}
    </>
  );
});

/** Markdown for a text group that has stopped growing. */
const StaticMarkdown = memo(function StaticMarkdown({ content }: { content: string }) {
  return <Markdown options={markdownOptions}>{transformPlanRefs(content)}</Markdown>;
});

/** One prose node. Owns the wrapper both the streaming and the finalized
 * render share, so a turn's markup does not change shape when it finalizes;
 * `appending` only picks the block-splitting renderer for the one node that is
 * still taking text. */
const ProseGroup = memo(function ProseGroup({
  content,
  tone,
  appending,
}: {
  content: string;
  tone: 'narration' | 'answer';
  appending: boolean;
}) {
  return (
    <div className={tone === 'narration' ? 'prose prose-narration mb-3' : 'prose'}>
      {appending ? <StreamingMarkdown content={content} /> : <StaticMarkdown content={content} />}
    </div>
  );
});

/** Render a turn's plan. The one place assistant nodes become DOM, shared by
 * the streaming and finalized paths so neither can drift from the other. */
const TurnNodes = memo(function TurnNodes({ nodes }: { nodes: TurnRenderNode[] }) {
  return (
    <>
      {nodes.map((node) => {
        if (node.kind === 'prose') {
          return (
            <ProseGroup
              key={node.key}
              content={node.content}
              tone={node.tone}
              appending={node.appending}
            />
          );
        }
        if (node.kind === 'checkpoint') {
          return <CheckpointDivider key={node.key} gapMs={node.gapMs} model={node.model} />;
        }
        return (
          <ProcessTimeline
            key={node.key}
            disclosureKey={node.disclosureKey}
            segments={node.segments}
            hasAnswer={node.hasAnswer}
            durationMs={node.durationMs}
            isStreaming={node.live !== null}
            streamingActivities={node.live?.activities}
            streamingThinking={node.live?.thinking}
            elapsedSeconds={node.live?.elapsedSeconds ?? null}
          />
        );
      })}
    </>
  );
});

const ASSISTANT_TURN_CONTENT_CLASS = 'chat-message-content text-text-primary';

/** The one wrapper an assistant turn's content renders through. Both the
 * streaming and finalized paths go through it, so the prose measure cannot
 * shift at the moment a turn finalizes. */
const AssistantTurnContent = memo(function AssistantTurnContent({
  nodes,
  caption,
  children,
}: {
  nodes: TurnRenderNode[];
  /** Sits outside the reading register so the caption keeps the UI's type. */
  caption?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      {caption}
      <div className={ASSISTANT_TURN_CONTENT_CLASS}>
        <TurnNodes nodes={nodes} />
        {children}
      </div>
    </>
  );
});

/** Render streaming segments within a single bubble. A segment-free turn
 * still gets the shared wrapper: `buildTurnRenderPlan` synthesizes a working
 * indicator for it, so there is no separate "nothing yet" case to render. */
export const StreamingContent = memo(function StreamingContent({
  segments,
  thinkingContent,
  activities,
  elapsedSeconds,
  caption,
}: {
  segments: MessageSegment[];
  thinkingContent?: string;
  activities: Activity[];
  elapsedSeconds: number | null;
  caption?: ReactNode;
}) {
  const plan = useMemo(
    () =>
      buildTurnRenderPlan({
        segments,
        live: { activities, thinking: thinkingContent, elapsedSeconds },
      }),
    [segments, activities, thinkingContent, elapsedSeconds]
  );

  return <AssistantTurnContent nodes={plan.nodes} caption={caption} />;
});

/** The in-flight turn's own header + wrapper — the real ancestor chain
 * `StreamingContent` renders inside, mirroring what `MessageRow` is for the
 * finalized side. Kept as one component so both the app and its tests render
 * the actual call-site markup rather than `StreamingContent` in isolation. */
export const StreamingTurn = memo(function StreamingTurn({
  segments,
  thinkingContent,
  activities,
  elapsedSeconds,
  model,
  isMergeableContinuation,
  startedAt,
}: {
  segments: MessageSegment[];
  thinkingContent?: string;
  activities: Activity[];
  elapsedSeconds: number | null;
  model?: string;
  isMergeableContinuation: boolean;
  startedAt: number | null;
}) {
  return (
    <div
      role="article"
      className={`chat-message-assistant chat-message-enter ${
        isMergeableContinuation ? 'pt-0 pb-5' : 'chat-turn-assistant'
      }`}
      aria-label="Assistant response"
    >
      <StreamingContent
        segments={segments}
        thinkingContent={thinkingContent}
        activities={activities}
        elapsedSeconds={elapsedSeconds}
        caption={
          isMergeableContinuation ? undefined : (
            <StreamingHeader model={model} elapsedSeconds={elapsedSeconds} startedAt={startedAt} />
          )
        }
      />
    </div>
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

/** What answered, on what model, for how long, and when.
 *
 * Every part stays in one group on the left rather than pushing the clock to
 * the far edge. The panel is resizable to 1600px, and a clock flung out there
 * stops reading as part of the caption it belongs to — it just floats. */
const AssistantCaption = memo(function AssistantCaption({
  timestamp,
  model,
  durationMs,
  copyContent,
}: {
  timestamp: Date;
  model?: string;
  durationMs?: number;
  /** Omitted while the turn is still streaming, when there is nothing final to copy. */
  copyContent?: string;
}) {
  const modelLabel = formatModelLabel(model);
  const durationLabel = formatTurnDuration(durationMs);
  return (
    <div className="flex h-6 items-center gap-2 font-mono text-tiny text-text-muted">
      <span className="flex-shrink-0 text-text-secondary">kpm</span>
      {modelLabel && <span className="truncate">{modelLabel}</span>}
      {durationLabel && <span className="flex-shrink-0">· {durationLabel}</span>}
      <span className="flex-shrink-0">· {formatClockTime(timestamp)}</span>
      {copyContent !== undefined && <CopyButton content={copyContent} />}
    </div>
  );
});

/** Your turn's caption. The note's position already says whose it is, so this
 * row only has to carry the clock. */
const UserCaption = memo(function UserCaption({
  timestamp,
  copyContent,
}: {
  timestamp: Date;
  copyContent: string;
}) {
  return (
    <div className="flex h-5 items-center gap-1.5 font-mono text-tiny text-text-muted">
      <CopyButton content={copyContent} />
      <span>you · {formatClockTime(timestamp)}</span>
    </div>
  );
});

export const MessageRow = memo(function MessageRow({
  message,
  onCancelQueued,
  /** Only the newest turn animates in; see `.chat-message-enter`. */
  entering,
}: {
  message: Message;
  onCancelQueued?: (clientMessageId: string) => void;
  entering?: boolean;
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

  const attachmentChips = hasStructuredAttachments ? (
    <div className={`flex flex-wrap gap-2 ${isUser ? 'mb-1.5 justify-end' : 'mb-1.5'}`}>
      {message.attachments!.map((attachment) => (
        <AttachmentChip key={attachment.path} attachment={attachment} thumbnailSize={40} />
      ))}
    </div>
  ) : null;

  if (!isUser) {
    return (
      <div
        role="article"
        className={`chat-message-assistant chat-turn-assistant group${
          entering ? ' chat-message-enter' : ''
        }`}
        aria-label="Assistant response"
      >
        {attachmentChips}
        <AssistantMessageContent
          segments={message.segments}
          interrupted={message.interrupted}
          startTimestamp={message.timestamp.getTime()}
          durationMs={message.durationMs}
          turnId={message.id}
          timestamp={message.timestamp}
          model={message.model}
        />
      </div>
    );
  }

  const userText = userParsed?.cleanContent || textContent;
  // Only a follow-up the provider has not taken yet can still be withdrawn.
  const awaitingDelivery = message.followUp === 'awaiting';

  return (
    <div
      role="article"
      className={`chat-message-user chat-turn-user group${entering ? ' chat-message-enter' : ''}`}
      aria-label="Your message"
    >
      {attachmentChips}

      {/* Legacy fallback: count chip for old "Images attached:" prefixed messages */}
      {userParsed && userParsed.imageCount > 0 && (
        <div className="mb-1.5 flex">
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

      <div
        className={`chat-message-content chat-note text-text-secondary whitespace-pre-wrap ${
          awaitingDelivery ? 'chat-note-queued' : ''
        }`}
      >
        <UserMessageText content={userText} />
      </div>

      {message.followUp && (
        <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1">
            {awaitingDelivery && (
              <svg className="w-3 h-3 animate-pulse" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="6" />
              </svg>
            )}
            {awaitingDelivery ? 'Adding to current response…' : 'Added while KPM was responding'}
          </span>
          {awaitingDelivery && onCancelQueued && message.clientMessageId && (
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

      <UserCaption timestamp={message.timestamp} copyContent={userText} />
    </div>
  );
});

/** Pre-measurement fallbacks for the virtualizer, split by role because an
 * answer at reading size runs far taller than the turn that prompted it. */
const EMPTY_BACKGROUND_TASKS: AgentBackgroundTask[] = [];

const ESTIMATED_ASSISTANT_HEIGHT = 168;
const ESTIMATED_USER_HEIGHT = 120;
const VIRTUAL_OVERSCAN_PX = 640;
const VIRTUALIZATION_MIN_MESSAGES = 40;

const VirtualizedMessageRow = memo(function VirtualizedMessageRow({
  message,
  top,
  onHeightChange,
  onCancelQueued,
  entering,
}: {
  message: Message;
  top: number;
  onHeightChange: (id: string, height: number) => void;
  onCancelQueued?: (clientMessageId: string) => void;
  entering?: boolean;
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
      <MessageRow message={message} onCancelQueued={onCancelQueued} entering={entering} />
    </div>
  );
});

interface MessageListProps {
  onCancelQueued?: (clientMessageId: string) => void;
  /** The failed turn's message, rendered at the end of the transcript. */
  error?: string | null;
  /** Omitted when there is no message it would be correct to resend. */
  onRetry?: () => void;
  onDismissError?: () => void;
}

export function MessageList({
  onCancelQueued,
  error,
  onRetry,
  onDismissError,
}: MessageListProps) {
  // Access per-session chat state
  const { viewedSession, viewedSessionId, model } = useChatStore(
    useShallow((state) => {
      const session = state.viewedSessionId
        ? state.sessions.get(state.viewedSessionId) ?? null
        : null;
      return {
        viewedSession: session,
        viewedSessionId: state.viewedSessionId,
        model: session?.choice ? sessionModelId(session, '') : undefined,
      };
    })
  );

  const hasPendingPermission = usePermissionStore((state) =>
    viewedSessionId
      ? (state.pendingRequests.get(viewedSessionId)?.length ?? 0) > 0
      : state.unscopedPendingRequests.length > 0
  );

  const messages = viewedSession?.messages ?? [];
  const streamingSegments = viewedSession?.streamingSegments ?? [];
  const streamingContent = viewedSession?.streamingContent ?? '';
  const streamingThinking = viewedSession?.streamingThinking ?? '';
  const isStreaming = viewedSession?.isStreaming ?? false;
  const backgroundTasks = viewedSession?.backgroundTasks ?? EMPTY_BACKGROUND_TASKS;
  // Every message renders in chronological order, including follow-ups
  // interjected mid-turn: they appear above the in-flight response (which the
  // backend finalizes after them), so the response never sits above the
  // messages it answered. The per-message "queued"/"Added while…" caption
  // (see MessageRow) carries the interjection status instead of a separate group.
  const staticMessages = messages;
  // When the last committed message is one `mergeAssistantTurns` (messageMerge.ts)
  // would merge into, a new live turn starting now will merge into it once
  // finalized — so render it attached (no header) rather than as a new card.
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const isMergeableContinuation = canMergeAssistantTurn(lastMessage ?? undefined);
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
  const [newestMessageId, setNewestMessageId] = useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [measurementVersion, setMeasurementVersion] = useState(0);
  const [timeNow, setTimeNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => setTimeNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  // Mark a turn as arriving only when it is appended to a list that was
  // already painted. A stored conversation opening for the first time is not
  // an arrival, and neither is a row the virtualizer remounts on scroll.
  const messageCount = messages.length;
  const lastMessageId = lastMessage?.id ?? null;
  const prevMessageCountRef = useRef(messageCount);
  useEffect(() => {
    if (messageCount > prevMessageCountRef.current) {
      setNewestMessageId(lastMessageId);
    }
    prevMessageCountRef.current = messageCount;
  }, [messageCount, lastMessageId]);

  const elapsedSeconds = useMemo(() => {
    if (!streamStartedAt) return null;
    return Math.max(0, Math.floor((timeNow - streamStartedAt) / 1000));
  }, [streamStartedAt, timeNow]);

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    const list = listRef.current;
    if (!list) return;
    // An explicit 'smooth' here outranks the reduced-motion block in CSS, so
    // the preference has to be answered in the call itself or a long scroll
    // still animates for someone who asked it not to.
    const effective = behavior === 'smooth' && prefersReducedMotion() ? 'auto' : behavior;
    if (effective === 'auto') {
      setScrollTop(Math.max(0, list.scrollHeight - list.clientHeight));
    }
    list.scrollTo({ top: list.scrollHeight, behavior: effective });
  };

  const isNearBottom = () => {
    const list = listRef.current;
    if (!list) return true;
    const threshold = 48;
    return list.scrollHeight - (list.scrollTop + list.clientHeight) <= threshold;
  };

  // `scrollTop` only feeds the virtualizer's visible-window math, so short
  // conversations never need it, and long ones need it at most once a frame —
  // writing it on every scroll event re-renders the whole list per event.
  const scrollFrameRef = useRef<number | null>(null);
  const trackScrollTop = (list: HTMLDivElement) => {
    if (staticMessages.length < VIRTUALIZATION_MIN_MESSAGES) return;
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      setScrollTop(list.scrollTop);
    });
  };

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  const handleScroll = () => {
    const list = listRef.current;
    if (list) {
      trackScrollTop(list);
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
      const measuredHeight =
        messageHeightsRef.current.get(message.id) ??
        (message.role === 'user' ? ESTIMATED_USER_HEIGHT : ESTIMATED_ASSISTANT_HEIGHT);
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

  // The permission prompt and the failed-turn card live inside the transcript
  // now, so the empty state must not short-circuit past either of them.
  if (messages.length === 0 && !isStreaming && !error && !hasPendingPermission) {
    return <div className="flex-1 min-h-0" />;
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={listRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        aria-relevant="additions text"
        // The foot of the scroller is where the jump-to-latest control sits, so
        // the transcript ends above it rather than under it. Padding on the
        // scroller, not the measured content: the virtualizer's tops are
        // relative to the content box and must not move.
        className="h-full overflow-y-auto px-3 pt-3 pb-10"
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
              entering={message.id === newestMessageId}
            />
          ))}
        </div>

        {/* Streaming response — attached without its own header when it will
            merge into the last static message on finalize (see
            `isMergeableContinuation`), so it reads as a continuation. A
            segment-free turn still renders here: StreamingContent's plan
            synthesizes the working indicator, so there is no separate
            "waiting for response" branch. */}
        {isStreaming && (
          <StreamingTurn
            segments={streamingSegments}
            thinkingContent={streamingThinking || undefined}
            activities={activities}
            elapsedSeconds={elapsedSeconds}
            model={model}
            isMergeableContinuation={isMergeableContinuation}
            startedAt={streamStartedAt}
          />
        )}

        <BackgroundTaskStrip tasks={backgroundTasks} />

        {/* Both of these belong to the conversation, not to the panel: they sit
            on the answer's left edge, scroll with the messages they refer to,
            and never permanently deduct from the reading area. */}
        <PermissionPrompt chatSessionId={viewedSessionId} />

        {error && onDismissError && (
          <TurnError error={error} onRetry={onRetry} onDismiss={onDismissError} />
        )}
      </div>

      {/* Only the control itself takes pointer events: a strip across the foot
          of the scroller would swallow selection and link clicks on whatever
          line of the transcript happened to sit under it. */}
      {!autoFollow && (
        <div className="absolute bottom-3 right-3 pointer-events-none">
          <button
            onClick={() => {
              scrollToBottom('smooth');
              setAutoFollow(true);
              setHasUnseenMessages(false);
            }}
            className="pointer-events-auto inline-flex items-center gap-1.5 px-2 py-1 rounded-sm font-mono text-tiny text-text-secondary bg-surface-elevated border border-border-strong hover:text-text-primary hover:bg-surface-3 transition-colors"
            aria-label="Jump to the latest messages"
          >
            {hasUnseenMessages && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
            )}
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7-7-7m7 7V3" />
            </svg>
            <span>{hasUnseenMessages ? 'new below' : 'latest'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
