import { emit } from '../storeEvents';
import type { ChatState, ChatSet, ChatGet } from './types';
import { createInitialPerSessionState } from './baseState';
import { streamingBuffer } from './utils';
import { applyStreamEvent } from './chatStreamReducer';

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
        ...createInitialPerSessionState(state.nextSessionNumber, state.model, state.effort, state.provider, state.piProviderModel, state.codexModel),
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
        // The previously viewed session's buffer was flushing at the viewed
        // 50ms interval; flush it now so no chunks are stranded mid-stream
        // before it switches to the background 250ms interval.
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
      // Flush (not clear) any buffered-but-unapplied chunks: teardown can run
      // without a prior `finalizeMessage` call (see `NewSessionButton`'s
      // disconnect-then-deactivate sequence), so the throttle buffer may
      // still hold text that never made it into `streamingSegments`.
      // Dropping it here would silently lose the tail of a turn `deactivate`
      // is about to commit.
      const buffered = streamingBuffer.flush(chatSessionId);

      set((state) => {
        const activeSessionIds = new Set(state.activeSessionIds);
        activeSessionIds.delete(chatSessionId);

        const sessions = new Map(state.sessions);
        const session = sessions.get(chatSessionId);
        if (session) {
          sessions.set(chatSessionId, {
            ...applyStreamEvent(session, { type: 'deactivate', buffered }),
            sessionState: 'idle',
            // The CLI process is gone, so its background tasks are too.
            backgroundTasks: [],
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

      // Closing the last tab is a request to be done with chat, so the panel
      // hides instead of opening a replacement session. The layout owns that
      // collapse, hence the event.
      if (sessions.size === 0) emit({ type: 'chat-tabs-emptied' });
    },
  };
}
