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

        const segments = [...session.streamingSegments];

        if (buffered) {
          const lastSegment = segments[segments.length - 1];
          if (lastSegment?.type === 'text') {
            lastSegment.content += buffered;
          } else {
            segments.push({ type: 'text', content: buffered });
          }
        }

          if (seg.type === 'text') return seg.content.trim().length > 0;
          if (seg.type === 'activity') return seg.activities.length > 0;
          return false;
        });

        if (finalSegments.length === 0) {
          sessions.set(chatSessionId, {
            ...session,
            streamingContent: '',
            streamingSegments: [],
            pendingActivities: [],
            activities: [],
          });
          return { sessions };
        }

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
        lastStreamUpdateAt: now,
      });

      return { sessions };
    }),

  };
}
