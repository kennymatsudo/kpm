import type { Activity, Message, MessageSegment, PerSessionState } from './types';

export type ChatStreamEvent =
  | { type: 'chunk'; text: string }
  | { type: 'queue-activities'; activities: Activity[] }
  | { type: 'thinking'; text: string }
  | { type: 'activity-start'; activity: Activity }
  | { type: 'activity-update'; activity: Activity }
  | { type: 'flush'; text: string }
  | { type: 'retry' }
  | { type: 'error'; error: string }
  | { type: 'queue-cleared-already-sent'; clientMessageId?: string }
  | { type: 'queue-cleared-dropped'; clientMessageId?: string }
  | { type: 'done'; options?: FinalizeOptions; buffered?: string };

export interface FinalizeOptions {
  interrupted?: boolean;
  model?: string;
  beforeClientMessageId?: string;
  /**
   * When set, atomically hand off to a queued follow-up: after committing the
   * assistant bubble, clear this message's queued flag and re-enter streaming
   * for the next turn. Implies `beforeClientMessageId`.
   */
  promoteQueuedClientMessageId?: string;
  /**
   * When set, this finalize ends the turn (no follow-up): clear the queued
   * flag from this message because the SDK absorbed it into the turn being
   * finalized. Unlike `promoteQueuedClientMessageId` it does NOT re-enter
   * streaming and does NOT anchor the assistant bubble before it — the
   * message was answered by this turn, so the bubble lands after it.
   */
  clearQueuedClientMessageId?: string;
}

/**
 * Append raw buffered text onto the last text segment without touching
 * pendingActivities or the streaming timestamps — used when a viewed
 * session's throttle buffer is force-flushed outside the normal chunk path
 * (e.g. switching tabs mid-stream), where those side effects don't apply.
 */
function appendTextToSegments(segments: MessageSegment[], text: string): void {
  const lastSegment = segments[segments.length - 1];
  if (lastSegment?.type === 'text') {
    lastSegment.content += text;
  } else {
    segments.push({ type: 'text', content: text });
  }
}

function appendTextOnly(session: PerSessionState, text: string): PerSessionState {
  if (!text) return session;
  const segments = [...session.streamingSegments];
  appendTextToSegments(segments, text);

  return {
    ...session,
    streamingSegments: segments,
    streamingContent: session.streamingContent + text,
  };
}

/**
 * Emit text into the currently rendered segments/content, committing any
 * activities queued ahead of it into an inline segment first. Shared by the
 * throttled (viewed) and immediate (unviewed) flush paths — the only
 * difference between them is which text they append (buffered vs. raw chunk).
 */
function flushTextIntoSession(session: PerSessionState, text: string, now: number): PerSessionState {
  const segments = [...session.streamingSegments];
  let pendingActivities = session.pendingActivities;
  let activities = session.activities;

  if (pendingActivities.length > 0) {
    segments.push({ type: 'activity', activities: pendingActivities });
    // These tools just landed in an inline segment at their chronological
    // position. Drop them from the live `activities` list so the streaming
    // view's trailing "active" group stops re-rendering them pinned at the
    // bottom — a duplicate of the now-inline copy. `activities` then holds
    // only the in-flight batch.
    const committedIds = new Set(pendingActivities.map((a) => a.id));
    activities = activities.filter((a) => !committedIds.has(a.id));
    pendingActivities = [];
  }

  if (text) {
    appendTextToSegments(segments, text);
  }

  return {
    ...session,
    streamingSegments: segments,
    streamingContent: session.streamingContent + text,
    pendingActivities,
    activities,
    isStreaming: true,
    streamStartedAt: session.streamStartedAt ?? now,
    lastStreamUpdateAt: now,
  };
}

/**
 * Clear the `queued` flag from the targeted user message. If a
 * clientMessageId is supplied, target that specific message; otherwise clear
 * the first queued user message found (covers callers that don't track ids).
 */
function clearQueuedFlagByClientMessageId(messages: Message[], clientMessageId: string | undefined): Message[] {
  const index = messages.findIndex((message) => {
    if (message.role !== 'user' || !message.queued) return false;
    return !clientMessageId || message.clientMessageId === clientMessageId;
  });
  if (index === -1) return messages;

  const { queued: _queued, ...rest } = messages[index];
  return [...messages.slice(0, index), rest, ...messages.slice(index + 1)];
}

function removeQueuedFollowUp(messages: Message[], clientMessageId: string): Message[] {
  const index = messages.findIndex(
    (message) => message.role === 'user' && message.liveFollowUp && message.clientMessageId === clientMessageId,
  );
  if (index === -1) return messages;
  return [...messages.slice(0, index), ...messages.slice(index + 1)];
}

function applyPromotionOrClear(
  messages: Message[],
  promoteId: string | undefined,
  clearQueuedId: string | undefined,
): Message[] {
  const stripQueuedId = promoteId ?? clearQueuedId;
  if (!stripQueuedId) return messages;
  return messages.map((message) => {
    if (message.role !== 'user' || message.clientMessageId !== stripQueuedId) return message;
    if (promoteId && message.liveFollowUp) {
      const { queued: _queued, liveFollowUp: _liveFollowUp, ...rest } = message;
      return rest;
    }
    if (message.queued) {
      const { queued: _queued, ...rest } = message;
      return rest;
    }
    return message;
  });
}

function clearCompletedLiveFollowUps(messages: Message[], promoteId: string | undefined): Message[] {
  const promoteIndex = promoteId
    ? messages.findIndex((message) => message.role === 'user' && message.clientMessageId === promoteId)
    : -1;
  return messages.map((message, index) => {
    if (message.role !== 'user' || !message.liveFollowUp) return message;
    const belongsToCompletedTurn = promoteId ? index < promoteIndex : true;
    if (!belongsToCompletedTurn) return message;
    const { queued: _queued, liveFollowUp: _liveFollowUp, ...rest } = message;
    return rest;
  });
}

function finalize(session: PerSessionState, options: FinalizeOptions | undefined, buffered: string): PerSessionState {
  const interrupted = options?.interrupted ?? false;
  // When promoting a queued follow-up, anchor the finalized bubble before
  // that follow-up and re-enter streaming in this same transition.
  const promoteId = options?.promoteQueuedClientMessageId;
  const clearQueuedId = options?.clearQueuedClientMessageId;
  const beforeClientMessageId = options?.beforeClientMessageId ?? promoteId;
  const now = Date.now();

  const promotionStreamingState = promoteId
    ? {
        isStreaming: true,
        error: null,
        streamStartedAt: now,
        lastStreamUpdateAt: now,
      }
    : {
        isStreaming: false,
        streamStartedAt: null,
        lastStreamUpdateAt: null,
      };

  const segments = [...session.streamingSegments];

  // Idempotency guard: repeated done/deactivated events can arrive after
  // we've already finalized and cleared this turn. When promoting a queued
  // follow-up we still must clear its queued flag and re-enter streaming, so
  // don't bail early in that case.
  if (
    !promoteId &&
    !session.isStreaming &&
    segments.length === 0 &&
    !buffered &&
    !session.streamingThinking &&
    session.pendingActivities.length === 0 &&
    session.activities.length === 0
  ) {
    return session;
  }

  if (session.streamingThinking.trim()) {
    segments.unshift({ type: 'thinking', content: session.streamingThinking.trim() });
  }

  if (session.pendingActivities.length > 0) {
    segments.push({ type: 'activity', activities: session.pendingActivities });
  }

  if (buffered) {
    appendTextToSegments(segments, buffered);
  }

  let finalSegments = segments.filter((segment) => {
    if (segment.type === 'text') return segment.content.trim().length > 0;
    if (segment.type === 'activity') return segment.activities.length > 0;
    if (segment.type === 'thinking') return segment.content.trim().length > 0;
    return false;
  });

  // Tool/activity-only turns (no text chunks) should still be committed so
  // the user sees that the turn completed and what happened.
  if (finalSegments.length === 0 && session.activities.length > 0) {
    finalSegments = [{ type: 'activity', activities: session.activities }];
  }

  if (finalSegments.length === 0) {
    return {
      ...session,
      messages: clearCompletedLiveFollowUps(applyPromotionOrClear(session.messages, promoteId, clearQueuedId), promoteId),
      streamingContent: '',
      streamingThinking: '',
      streamingSegments: [],
      pendingActivities: [],
      activities: [],
      ...promotionStreamingState,
    };
  }

  const durationMs = session.streamStartedAt != null ? Math.max(0, now - session.streamStartedAt) : undefined;
  const displayModel = options?.model ?? getSessionDisplayModel(session);

  // Strip the queued flag (from a promoted or consumed follow-up) BEFORE
  // positioning so the insertion logic sees an accurate `queued` state. For a
  // consumed follow-up this matters: once it is no longer flagged queued, the
  // fallback walk below won't step over it, so the assistant bubble lands
  // AFTER it — chronologically correct, since this turn answered it.
  const baseMessages = clearCompletedLiveFollowUps(applyPromotionOrClear(session.messages, promoteId, clearQueuedId), promoteId);

  // Merge this turn into the previous message when it's an uninterrupted
  // assistant turn with nothing in between — this is what keeps a multi-turn
  // exchange (e.g. periodic check-ins on a forked background agent) rendering
  // as one continuous card instead of a new bubble per turn. A
  // `beforeClientMessageId` anchor means a user message genuinely landed in
  // between, so merging is skipped in that case.
  const mergeTarget = baseMessages[baseMessages.length - 1];
  const canMergeIntoPrevious =
    !beforeClientMessageId && mergeTarget?.role === 'assistant' && !mergeTarget.interrupted;

  let nextMessages: Message[];

  if (canMergeIntoPrevious) {
    // Carries the outgoing turn's own stats forward as a divider inside the
    // merged message, so per-step timing survives even though the top-level
    // fields below move on to describe the latest turn.
    const checkpoint: MessageSegment = {
      type: 'checkpoint',
      timestamp: now,
      ...(mergeTarget.durationMs != null ? { durationMs: mergeTarget.durationMs } : {}),
      ...(mergeTarget.model ? { model: mergeTarget.model } : {}),
    };

    const mergedMessage: Message = {
      ...mergeTarget,
      segments: [...mergeTarget.segments, checkpoint, ...finalSegments],
      model: displayModel,
      // Cumulative since the exchange's first turn — a growing total that
      // signals ongoing progress across the merged turns, rather than
      // resetting to just this latest turn's own duration.
      durationMs: Math.max(0, now - mergeTarget.timestamp.getTime()),
      ...(interrupted ? { interrupted: true } : {}),
    };
    nextMessages = [...baseMessages.slice(0, -1), mergedMessage];
  } else {
    const newMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      segments: finalSegments,
      timestamp: new Date(now),
      model: displayModel,
      ...(durationMs != null ? { durationMs } : {}),
      ...(interrupted ? { interrupted: true } : {}),
    };

    // Position the finalized assistant bubble before the queued follow-up so
    // chronology reads correctly (this turn answered the *earlier* message).
    // Anchor by clientMessageId rather than the transient `queued` flag: a
    // racing queue-cleared event can strip `queued` before this runs, and
    // relying on the flag would then append the bubble after the follow-up
    // and invert the order. The id is stable; the flag is not.
    nextMessages = [...baseMessages, newMessage];
    if (beforeClientMessageId) {
      const insertAt = baseMessages.findIndex(
        (message) => message.role === 'user' && message.clientMessageId === beforeClientMessageId,
      );
      if (insertAt !== -1) {
        nextMessages = [...baseMessages.slice(0, insertAt), newMessage, ...baseMessages.slice(insertAt)];
      }
    } else {
      // No explicit anchor — fall back to walking past any trailing queued
      // user messages so the bubble still lands before a pending follow-up.
      let insertAt = baseMessages.length;
      while (
        insertAt > 0 &&
        baseMessages[insertAt - 1]?.role === 'user' &&
        baseMessages[insertAt - 1]?.queued
      ) {
        insertAt -= 1;
      }
      if (insertAt !== baseMessages.length) {
        nextMessages = [...baseMessages.slice(0, insertAt), newMessage, ...baseMessages.slice(insertAt)];
      }
    }
  }

  return {
    ...session,
    messages: nextMessages,
    streamingContent: '',
    streamingThinking: '',
    streamingSegments: [],
    pendingActivities: [],
    activities: [],
    ...promotionStreamingState,
  };
}

export function applyStreamEvent(session: PerSessionState, event: ChatStreamEvent): PerSessionState {
  const now = Date.now();

  switch (event.type) {
    case 'chunk':
      return flushTextIntoSession(session, event.text, now);

    case 'queue-activities':
      return { ...session, pendingActivities: [...session.pendingActivities, ...event.activities] };

    case 'flush':
      return appendTextOnly(session, event.text);

    case 'thinking':
      return {
        ...session,
        streamingThinking: session.streamingThinking ? session.streamingThinking + '\n\n' + event.text : event.text,
        isStreaming: true,
        streamStartedAt: session.streamStartedAt ?? now,
        lastStreamUpdateAt: now,
      };

    case 'activity-start':
      return {
        ...session,
        activities: [...session.activities.slice(-5), event.activity],
        isStreaming: true,
        streamStartedAt: session.streamStartedAt ?? now,
        lastStreamUpdateAt: now,
      };

    case 'activity-update': {
      const replaceById = (activity: Activity) => (activity.id === event.activity.id ? event.activity : activity);

      const messages: Message[] = session.messages.map((message) => {
        let touched = false;
        const segments = message.segments.map((segment) => {
          if (segment.type !== 'activity') return segment;
          if (!segment.activities.some((activity) => activity.id === event.activity.id)) return segment;
          touched = true;
          return { ...segment, activities: segment.activities.map(replaceById) };
        });
        return touched ? { ...message, segments } : message;
      });

      const streamingSegments = session.streamingSegments.map((segment) => {
        if (segment.type !== 'activity') return segment;
        if (!segment.activities.some((activity) => activity.id === event.activity.id)) return segment;
        return { ...segment, activities: segment.activities.map(replaceById) };
      });

      return {
        ...session,
        activities: session.activities.map(replaceById),
        pendingActivities: session.pendingActivities.map(replaceById),
        streamingSegments,
        messages,
      };
    }

    case 'retry':
      return {
        ...session,
        isStreaming: true,
        error: null,
        activities: [],
        streamingContent: '',
        streamingThinking: '',
        streamingSegments: [],
        pendingActivities: [],
        streamStartedAt: now,
        lastStreamUpdateAt: now,
        suggestions: [],
      };

    case 'error':
      return {
        ...session,
        error: event.error,
        isStreaming: false,
        streamingContent: '',
        streamingThinking: '',
        activities: [],
        streamingSegments: [],
        pendingActivities: [],
        streamStartedAt: null,
        lastStreamUpdateAt: null,
      };

    case 'queue-cleared-already-sent': {
      const messages = clearQueuedFlagByClientMessageId(session.messages, event.clientMessageId);
      return messages === session.messages ? session : { ...session, messages };
    }

    case 'queue-cleared-dropped': {
      if (!event.clientMessageId) return session;
      const messages = removeQueuedFollowUp(session.messages, event.clientMessageId);
      return messages === session.messages ? session : { ...session, messages };
    }

    case 'done':
      return finalize(session, event.options, event.buffered ?? '');

    default:
      return session;
  }
}

const STREAM_STALE_THRESHOLD_MS = 30_000;

function getSessionDisplayModel(session: Pick<PerSessionState, 'provider' | 'model' | 'codexModel' | 'piProviderModel'>): string {
  if (session.provider === 'pi' && session.piProviderModel) return session.piProviderModel;
  if (session.provider === 'codex') return session.codexModel;
  return session.model;
}

/**
 * True once a session has been streaming without a chunk/activity update for
 * longer than the stale threshold. The bridge polls this on an interval and,
 * once confirmed stale against the backend's own session state, dispatches a
 * `done` event to force-finalize the stuck turn.
 */
export function isStreamStale(session: PerSessionState, now: number): boolean {
  if (!session.isStreaming) return false;
  const lastStreamUpdateAt = session.lastStreamUpdateAt ?? session.streamStartedAt;
  if (!lastStreamUpdateAt) return false;
  return now - lastStreamUpdateAt >= STREAM_STALE_THRESHOLD_MS;
}
