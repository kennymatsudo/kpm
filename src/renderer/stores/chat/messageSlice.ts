import { createInitialPerSessionState, createInitialChatState } from './baseState';
import { streamingBuffer } from './utils';

export function createMessageSlice(set: ChatSet, get: ChatGet): Pick<ChatState,
> {
  return {
      const sessions = new Map(state.sessions);
      const now = Date.now();


      return {
        sessions,
        nextSessionNumber: sessions.has(chatSessionId) ? state.nextSessionNumber : state.nextSessionNumber + 1,
      };
    }),

    setRetrying: (chatSessionId) => set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(chatSessionId);
      if (!session) return state;
      const now = Date.now();

      sessions.set(chatSessionId, {
        ...session,
        isStreaming: true,
        error: null,
        activities: [],
        streamingContent: '',
        streamingSegments: [],
        pendingActivities: [],
        streamStartedAt: now,
        lastStreamUpdateAt: now,
      });

      return { sessions };
    }),

    setError: (chatSessionId, error) => {
      const isViewed = get().viewedSessionId === chatSessionId;
      if (isViewed) streamingBuffer.clear();

      set((state) => {
        const sessions = new Map(state.sessions);
        const session = sessions.get(chatSessionId);
        if (!session) return state;

        sessions.set(chatSessionId, {
          ...session,
          error,
          isStreaming: false,
          activities: [],
          streamingSegments: [],
          pendingActivities: [],
          streamStartedAt: null,
          lastStreamUpdateAt: null,
        });

        return { sessions };
      });
    },

    clearError: (chatSessionId) => set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(chatSessionId);
      if (!session) return state;

      sessions.set(chatSessionId, { ...session, error: null });
      return { sessions };
    }),

    setDraftMessage: (chatSessionId, draftMessage) => set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(chatSessionId);
      if (!session) {
        sessions.set(
          chatSessionId,
          {
            draftMessage,
          }
        );
        return {
          sessions,
          nextSessionNumber: state.nextSessionNumber + 1,
        };
      }

      sessions.set(chatSessionId, { ...session, draftMessage });
      return { sessions };
    }),

    setSessionState: (chatSessionId, sessionState) => set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(chatSessionId);
      if (!session) return state;

      sessions.set(chatSessionId, { ...session, sessionState });
      return { sessions };
    }),

    reset: () => {
      streamingBuffer.clear();
      set(createInitialChatState());
    },

    resetProjectState: () => {
      streamingBuffer.clear();
      set((state) => ({
        ...createInitialChatState(),
        model: state.model,
      }));
    },
  };
}
