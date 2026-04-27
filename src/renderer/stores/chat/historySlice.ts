import { getChatSessionHistory, loadChatSession } from '../../services/chatService';
import { createInitialPerSessionState } from './baseState';

const SESSION_HISTORY_LIMIT = 10;

function isCurrent(shouldContinue?: () => boolean): boolean {
  return shouldContinue ? shouldContinue() : true;
}

async function fetchRecentSessions(projectId: string): Promise<ChatSessionSummary[] | null> {
  const result = await getChatSessionHistory(projectId, SESSION_HISTORY_LIMIT);
  return result.success && result.sessions ? result.sessions : null;
}

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
      if (state.viewedSessionId) {
        if (state.sessions.has(state.viewedSessionId)) {
          return state.viewedSessionId;
        }

        // Heal stale viewedSessionId pointers so input/send state remains stable.
        const sessions = new Map(state.sessions);
        sessions.set(
          state.viewedSessionId,
        );
        set({
          sessions,
          nextSessionNumber: state.nextSessionNumber + 1,
        });
        return state.viewedSessionId;
      }
      return get().startNewChatSession();
    },

    loadSessionHistory: async (projectId) => {
      try {
        const sessions = await fetchRecentSessions(projectId);
        if (sessions) {
          set({ sessionHistory: sessions });
        }
      } catch (error) {
        console.error('[ChatStore] Failed to load session history:', error);
      }
    },

    // Loads recent history and auto-opens the most recent session if one exists.
    // Called on project load so the user lands back in their last conversation.
    restoreLastSession: async (projectId, shouldContinue) => {
      try {

        const sessions = await fetchRecentSessions(projectId);
        if (!isCurrent(shouldContinue) || !sessions) return;

        set({ sessionHistory: sessions });
          return;
        }

        await get().loadFromHistory(projectId, sessions[0].chat_session_id, shouldContinue);
      } catch (error) {
        console.error('[ChatStore] Failed to restore last session:', error);
      }
    },

    loadFromHistory: async (projectId, chatSessionId, shouldContinue) => {
      try {
        const result = await loadChatSession(projectId, chatSessionId);
        if (!isCurrent(shouldContinue)) return;

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

          if (!isCurrent(shouldContinue)) return;

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
