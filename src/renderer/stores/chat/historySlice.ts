import { createInitialPerSessionState } from './baseState';

export function createHistorySlice(set: ChatSet, get: ChatGet): Pick<ChatState,
> {
  return {
    startNewChatSession: (_keepCurrentActive = true) => {
      const newSessionId = crypto.randomUUID();
      const state = get();

      const sessions = new Map(state.sessions);
      sessions.set(newSessionId, newSession);

      set({
        sessions,
        viewedSessionId: newSessionId,
        nextSessionNumber: state.nextSessionNumber + 1,
      });

      return newSessionId;
    },

    getChatSessionId: () => {
      const state = get();
      return get().startNewChatSession();
    },

    loadSessionHistory: async (projectId) => {
      try {
        }
      } catch (error) {
        console.error('[ChatStore] Failed to load session history:', error);
      }
    },

      try {
        if (result.success && result.messages) {
              id: m.id,
              role: m.role,

          const state = get();
          const sessions = new Map(state.sessions);
          const existingSession = sessions.get(chatSessionId);

          sessions.set(chatSessionId, {
            messages,
            error: null,
          });

          set({
            sessions,
            viewedSessionId: chatSessionId,
            nextSessionNumber: existingSession ? state.nextSessionNumber : state.nextSessionNumber + 1,
          });
        }
      } catch (error) {
        console.error('[ChatStore] Failed to load session from history:', error);
      }
    },

  };
}
