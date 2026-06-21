import type { ChatState, ChatSet, ChatGet } from './types';
import { createInitialPerSessionState } from './baseState';
import { streamingBuffer } from './utils';

export function createSessionManagementSlice(set: ChatSet, get: ChatGet): Pick<ChatState,
  'getOrCreateSession' | 'setViewedSession' | 'markSessionActive' | 'markSessionInactive' | 'removeSession'
> {
  return {
    getOrCreateSession: (chatSessionId, options) => {
      const state = get();
      const existing = state.sessions.get(chatSessionId);
      if (existing) {
        if (options?.hydrated === false && existing.hydrated && existing.messages.length === 0) {
          const sessions = new Map(state.sessions);
          const updated = { ...existing, hydrated: false };
          sessions.set(chatSessionId, updated);
          set({ sessions });
          return updated;
        }
        return existing;
      }

      const newSession = {
        ...createInitialPerSessionState(state.nextSessionNumber, state.model, state.effort),
        hydrated: options?.hydrated ?? true,
      };
      const sessions = new Map(state.sessions);
      sessions.set(chatSessionId, newSession);
      set({ sessions, nextSessionNumber: state.nextSessionNumber + 1 });
      return newSession;
    },

    setViewedSession: (chatSessionId) => {
      const previousViewedSessionId = get().viewedSessionId;
      if (previousViewedSessionId) {
        // The viewed session uses the shared throttled buffer. Flush pending
        // text into that session before switching pointers so we don't drop
        // chunks during mid-stream tab switches.
        get().flushStreamingContent(previousViewedSessionId);
      }

      set({ viewedSessionId: chatSessionId });
    },

    markSessionActive: (chatSessionId) => {
      const activeSessionIds = new Set(get().activeSessionIds);
      activeSessionIds.add(chatSessionId);
      set({ activeSessionIds });
    },

    markSessionInactive: (chatSessionId) => {
      const isViewed = get().viewedSessionId === chatSessionId;
      if (isViewed) {
        streamingBuffer.clear();
      }

      set((state) => {
        const activeSessionIds = new Set(state.activeSessionIds);
        activeSessionIds.delete(chatSessionId);

        const sessions = new Map(state.sessions);
        const session = sessions.get(chatSessionId);
        if (session) {
          sessions.set(chatSessionId, {
            ...session,
            isStreaming: false,
            streamingContent: '',
            streamingThinking: '',
            streamingSegments: [],
            pendingActivities: [],
            activities: [],
            sessionState: 'idle',
            streamStartedAt: null,
            lastStreamUpdateAt: null,
          });
        }

        return { activeSessionIds, sessions };
      });
    },

    removeSession: (chatSessionId) => {
      const state = get();
      const sessions = new Map(state.sessions);
      const activeSessionIds = new Set(state.activeSessionIds);

      sessions.delete(chatSessionId);
      activeSessionIds.delete(chatSessionId);

      let viewedSessionId = state.viewedSessionId;
      if (viewedSessionId === chatSessionId) {
        const remainingSessions = Array.from(sessions.keys());
        const activeRemaining = remainingSessions.filter(id => activeSessionIds.has(id));
        viewedSessionId = activeRemaining[0] ?? remainingSessions[0] ?? null;
      }

      set({ sessions, activeSessionIds, viewedSessionId });
    },
  };
}
