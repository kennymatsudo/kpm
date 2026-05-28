import { streamingBuffer } from './utils';

export function createStreamingSlice(set: ChatSet, get: ChatGet): Pick<ChatState,
> {
  return {
    appendChunk: (chatSessionId, chunk, _segmentId = 0, precedingActivities) => {
      if (precedingActivities && precedingActivities.length > 0) {
        set((state) => {
          const sessions = new Map(state.sessions);
          const session = sessions.get(chatSessionId);
          if (!session) return state;

          sessions.set(chatSessionId, {
            ...session,
            pendingActivities: [...session.pendingActivities, ...precedingActivities],
          });

          return { sessions };
        });
      }

      const isViewed = get().viewedSessionId === chatSessionId;

      if (isViewed) {
        streamingBuffer.append(chunk, (buffered) => {
          set((state) => {
            const now = Date.now();
            const sessions = new Map(state.sessions);
            const session = sessions.get(chatSessionId);
            if (!session) return state;

            const segments = [...session.streamingSegments];
            let newContent = session.streamingContent;
            let pendingActivities = session.pendingActivities;

            if (pendingActivities.length > 0) {
              segments.push({ type: 'activity', activities: pendingActivities });
              pendingActivities = [];
            }

            const lastSegment = segments[segments.length - 1];
            if (lastSegment?.type === 'text') {
              lastSegment.content += buffered;
            } else {
              segments.push({ type: 'text', content: buffered });
            }

            newContent += buffered;

            sessions.set(chatSessionId, {
              ...session,
              streamingSegments: segments,
              streamingContent: newContent,
              pendingActivities,
              isStreaming: true,
              streamStartedAt: session.streamStartedAt ?? now,
              lastStreamUpdateAt: now,
            });

            return { sessions };
          });
        });
      } else {
        set((state) => {
          const now = Date.now();
          const sessions = new Map(state.sessions);
          const session = sessions.get(chatSessionId);
          if (!session) return state;

          const segments = [...session.streamingSegments];
          let newContent = session.streamingContent;
          let pendingActivities = session.pendingActivities;

          if (pendingActivities.length > 0) {
            segments.push({ type: 'activity', activities: pendingActivities });
            pendingActivities = [];
          }

          const lastSegment = segments[segments.length - 1];
          if (lastSegment?.type === 'text') {
            lastSegment.content += chunk;
          } else {
            segments.push({ type: 'text', content: chunk });
          }

          newContent += chunk;

          sessions.set(chatSessionId, {
            ...session,
            streamingSegments: segments,
            streamingContent: newContent,
            pendingActivities,
            isStreaming: true,
            streamStartedAt: session.streamStartedAt ?? now,
            lastStreamUpdateAt: now,
          });

          return { sessions };
        });
      }
    },

    appendThinking: (chatSessionId, text) => set((state) => {
      const now = Date.now();
      const sessions = new Map(state.sessions);
      const session = sessions.get(chatSessionId);
      if (!session) return state;

      sessions.set(chatSessionId, {
        ...session,
        streamingThinking: session.streamingThinking
          ? session.streamingThinking + '\n\n' + text
          : text,
        isStreaming: true,
        streamStartedAt: session.streamStartedAt ?? now,
        lastStreamUpdateAt: now,
      });

      return { sessions };
    }),

    flushStreamingContent: (chatSessionId) => {
      const isViewed = get().viewedSessionId === chatSessionId;
      if (!isViewed) return;

      const buffered = streamingBuffer.flush();
      if (buffered) {
        set((state) => {
          const sessions = new Map(state.sessions);
          const session = sessions.get(chatSessionId);
          if (!session) return state;

          const segments = [...session.streamingSegments];

          const lastSegment = segments[segments.length - 1];
          if (lastSegment?.type === 'text') {
            lastSegment.content += buffered;
          } else {
            segments.push({ type: 'text', content: buffered });
          }

          sessions.set(chatSessionId, {
            ...session,
            streamingSegments: segments,
            streamingContent: session.streamingContent + buffered,
          });

          return { sessions };
        });
      }
    },

    finalizeMessage: (chatSessionId, options) => {
      const isViewed = get().viewedSessionId === chatSessionId;
      const buffered = isViewed ? streamingBuffer.flush() : '';
      const interrupted = options?.interrupted ?? false;
      // When promoting a queued follow-up, anchor the finalized bubble before
      // that follow-up and re-enter streaming in this same update.
      const promoteId = options?.promoteQueuedClientMessageId;
      // A follow-up the SDK absorbed into the turn being finalized: strip its
      // queued flag, but (unlike promotion) do NOT re-enter streaming and do NOT
      // anchor the bubble before it — this turn answered it, so the bubble lands
      // after it in chronological order.
      const clearQueuedId = options?.clearQueuedClientMessageId;
      const beforeClientMessageId = options?.beforeClientMessageId ?? promoteId;
      const now = Date.now();

      // Clears `queued` from the promoted/consumed follow-up (by id). When
      // promoting, also resets streaming fields so the next turn's thinking
      // indicator renders without a stale queued bubble lingering beside it.
      // Applied in the same `set()` as the finalize so the two never render in
      // an inconsistent pair.
      const stripQueuedId = promoteId ?? clearQueuedId;
      const applyPromotion = (messages: Message[]): Message[] => {
        if (!stripQueuedId) return messages;
      };
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

      set((state) => {
        const sessions = new Map(state.sessions);
        const session = sessions.get(chatSessionId);
        if (!session) {
          console.warn(`[finalizeMessage] Session not found: ${chatSessionId}`);
          return state;
        }

        const segments = [...session.streamingSegments];

        // Idempotency guard: repeated chat:done/session-deactivated events can
        // arrive after we've already finalized and cleared this turn. When
        // promoting a queued follow-up we still must clear its queued flag and
        // re-enter streaming, so don't bail early in that case.
        if (
          !promoteId &&
          !session.isStreaming &&
          segments.length === 0 &&
          !buffered &&
          !session.streamingThinking &&
          session.pendingActivities.length === 0 &&
          session.activities.length === 0
        ) {
          return state;
        }

        // Prepend thinking segment if Claude produced reasoning
        if (session.streamingThinking.trim()) {
          segments.unshift({ type: 'thinking', content: session.streamingThinking.trim() });
        }

        if (session.pendingActivities.length > 0) {
          segments.push({ type: 'activity', activities: session.pendingActivities });
        }

        if (buffered) {
          const lastSegment = segments[segments.length - 1];
          if (lastSegment?.type === 'text') {
            lastSegment.content += buffered;
          } else {
            segments.push({ type: 'text', content: buffered });
          }
        }

        let finalSegments = segments.filter((seg) => {
          if (seg.type === 'text') return seg.content.trim().length > 0;
          if (seg.type === 'activity') return seg.activities.length > 0;
          if (seg.type === 'thinking') return seg.content.trim().length > 0;
          return false;
        });

        // Tool/activity-only turns (no text chunks) should still be committed so
        // the user sees that the turn completed and what happened.
        if (finalSegments.length === 0 && session.activities.length > 0) {
          finalSegments = [{ type: 'activity', activities: session.activities }];
        }

        if (finalSegments.length === 0) {
          const hasAnyRenderableInput =
            !!buffered ||
            segments.length > 0 ||
            session.streamingContent.length > 0 ||
            session.pendingActivities.length > 0 ||
            session.activities.length > 0;

          if (hasAnyRenderableInput) {
            console.warn(`[finalizeMessage] Empty segments for ${chatSessionId} (wasStreaming: ${session.isStreaming}, streamingContent: ${session.streamingContent.length} chars, pendingActivities: ${session.pendingActivities.length}, activities: ${session.activities.length})`);
          } else if (session.isStreaming) {
            console.log(`[finalizeMessage] No assistant output for ${chatSessionId}; clearing streaming state`);
          }
          sessions.set(chatSessionId, {
            ...session,
            streamingContent: '',
            streamingThinking: '',
            streamingSegments: [],
            pendingActivities: [],
            activities: [],
            ...promotionStreamingState,
          });
          return { sessions };
        }

        const textLength = finalSegments
          .filter((s): s is { type: 'text'; content: string } => s.type === 'text')
          .reduce((sum, s) => sum + s.content.length, 0);

        const durationMs =
          session.streamStartedAt != null
            ? Math.max(0, Date.now() - session.streamStartedAt)
            : undefined;

        // Strip the queued flag (from a promoted or consumed follow-up) BEFORE
        // positioning so the insertion logic sees an accurate `queued` state.
        // For a consumed follow-up this matters: once it is no longer flagged
        // queued, the fallback walk below won't step over it, so the assistant
        // bubble lands AFTER it — chronologically correct, since this turn
        // answered it.

        } else {
          }
        }

        sessions.set(chatSessionId, {
          ...session,
          messages: nextMessages,
          streamingContent: '',
          streamingThinking: '',
          streamingSegments: [],
          pendingActivities: [],
          activities: [],
          ...promotionStreamingState,
        });

        return { sessions };
      });
    },

    addActivity: (chatSessionId, activity) => set((state) => {
      const now = Date.now();
      const sessions = new Map(state.sessions);
      const session = sessions.get(chatSessionId);
      if (!session) return state;

      sessions.set(chatSessionId, {
        ...session,
        activities: [...session.activities.slice(-5), activity],
        isStreaming: true,
        streamStartedAt: session.streamStartedAt ?? now,
        lastStreamUpdateAt: now,
      });

      return { sessions };
    }),

    updateActivity: (chatSessionId, activity) => set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(chatSessionId);
      if (!session) return state;

      const replaceById = (a: typeof activity) => (a.id === activity.id ? activity : a);

      const messages: Message[] = session.messages.map((message) => {
        let touched = false;
        const segments = message.segments.map((segment) => {
          if (segment.type !== 'activity') return segment;
          if (!segment.activities.some((a) => a.id === activity.id)) return segment;
          touched = true;
          return { ...segment, activities: segment.activities.map(replaceById) };
        });
        return touched ? { ...message, segments } : message;
      });

      const streamingSegments = session.streamingSegments.map((segment) => {
        if (segment.type !== 'activity') return segment;
        if (!segment.activities.some((a) => a.id === activity.id)) return segment;
        return { ...segment, activities: segment.activities.map(replaceById) };
      });

      sessions.set(chatSessionId, {
        ...session,
        activities: session.activities.map(replaceById),
        pendingActivities: session.pendingActivities.map(replaceById),
        streamingSegments,
        messages,
      });

      return { sessions };
    }),

  };
}
