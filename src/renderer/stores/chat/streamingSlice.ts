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

      const isViewed = get().viewedSessionId === chatSessionId;
      const buffered = isViewed ? streamingBuffer.flush() : '';

      set((state) => {
        const sessions = new Map(state.sessions);
        const session = sessions.get(chatSessionId);
        if (!session) {
          console.warn(`[finalizeMessage] Session not found: ${chatSessionId}`);
          return state;
        }

        const segments = [...session.streamingSegments];

        // Idempotency guard: repeated chat:done/session-deactivated events can
        if (
          !session.isStreaming &&
          segments.length === 0 &&
          !buffered &&
          session.pendingActivities.length === 0 &&
          session.activities.length === 0
        ) {
          return state;
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
            streamingSegments: [],
            pendingActivities: [],
            activities: [],
          });
          return { sessions };
        }

        const textLength = finalSegments
          .filter((s): s is { type: 'text'; content: string } => s.type === 'text')
          .reduce((sum, s) => sum + s.content.length, 0);

        sessions.set(chatSessionId, {
          ...session,
          streamingContent: '',
          streamingSegments: [],
          pendingActivities: [],
          activities: [],
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

  };
}
