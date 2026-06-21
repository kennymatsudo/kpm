import type { ChatMessage, ChatSessionSummary, MessageSegment } from '../../../shared/types';
import { getChatSessionHistory, loadChatSession } from '../../services/chatService';
import type { ChatState, ChatSet, ChatGet, Message, PerSessionState } from './types';
import { createInitialPerSessionState } from './baseState';
import { readPersistedTabs } from './persistence';

const SESSION_HISTORY_LIMIT = 10;

function isCurrent(shouldContinue?: () => boolean): boolean {
  return shouldContinue ? shouldContinue() : true;
}

async function fetchRecentSessions(projectId: string): Promise<ChatSessionSummary[] | null> {
  const result = await getChatSessionHistory(projectId, SESSION_HISTORY_LIMIT);
  return result.success && result.sessions ? result.sessions : null;
}

export function createHistorySlice(set: ChatSet, get: ChatGet): Pick<ChatState,
  | 'startNewChatSession'
  | 'getChatSessionId'
  | 'loadSessionHistory'
  | 'loadFromHistory'
  | 'restoreLastSession'
  | 'hydrateOpenSessions'
> {
  return {
    startNewChatSession: (_keepCurrentActive = true) => {
      const newSessionId = crypto.randomUUID();
      const state = get();

      const newSession = createInitialPerSessionState(state.nextSessionNumber, state.model, state.effort);
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
          createInitialPerSessionState(state.nextSessionNumber, state.model, state.effort)
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
    //
    // The IPC bridge may already have restored an active backend session as an
    // empty placeholder (correct id + title, but no messages) before this runs.
    // In that case we hydrate it from history rather than bail.
    restoreLastSession: async (projectId, shouldContinue) => {
      try {
        if (!isCurrent(shouldContinue)) return;

        const sessions = await fetchRecentSessions(projectId);
        if (!isCurrent(shouldContinue) || !sessions) return;

        set({ sessionHistory: sessions });
        if (sessions.length === 0) return;

        const currentViewed = get().viewedSessionId;
        if (currentViewed) {
          const session = get().sessions.get(currentViewed);
          if (session?.messages.length === 0) {
            await get().loadFromHistory(projectId, currentViewed, shouldContinue);
          }
          return;
        }

        if (!isCurrent(shouldContinue)) return;
        await get().loadFromHistory(projectId, sessions[0].chat_session_id, shouldContinue);
      } catch (error) {
        console.error('[ChatStore] Failed to restore last session:', error);
      }
    },

    // Restore every chat tab that was open at last shutdown from localStorage.
    // Tabs are created as unhydrated shells; messages load lazily when the
    // user focuses a tab. The most recently-focused tab gets eagerly hydrated
    // so the user lands in a populated conversation. Also sets
    // `persistedProjectId` so the subscription in `index.ts` knows which
    // localStorage key to write on subsequent tab-state changes.
    hydrateOpenSessions: async (projectId, shouldContinue) => {
      try {
        if (!isCurrent(shouldContinue)) return;

        const persisted = readPersistedTabs(projectId);
        if (!persisted || persisted.open.length === 0) {
          set({ persistedProjectId: projectId });
          return;
        }

        const state = get();
        const sessions = new Map(state.sessions);
        let nextSessionNumber = state.nextSessionNumber;
        const newlyAdded: string[] = [];

        for (const id of persisted.open) {
          if (sessions.has(id)) continue;
          const shell: PerSessionState = {
            ...createInitialPerSessionState(nextSessionNumber, state.model, state.effort),
            hydrated: false,
          };
          sessions.set(id, shell);
          nextSessionNumber += 1;
          newlyAdded.push(id);
        }

        // Persisted `open` is most-recent-first; persisted `viewed` (if valid)
        // wins, otherwise focus the most recently active tab.
        const persistedViewed =
          persisted.viewed && sessions.has(persisted.viewed) ? persisted.viewed : null;
        const viewedSessionId = state.viewedSessionId ?? persistedViewed ?? persisted.open[0];

        set({ sessions, viewedSessionId, nextSessionNumber, persistedProjectId: projectId });

        if (!isCurrent(shouldContinue)) return;
        const viewedSession = viewedSessionId ? sessions.get(viewedSessionId) : null;
        if (
          viewedSessionId &&
          (newlyAdded.includes(viewedSessionId) || viewedSession?.hydrated === false)
        ) {
          await get().loadFromHistory(projectId, viewedSessionId, shouldContinue);
        }
      } catch (error) {
        console.error('[ChatStore] Failed to hydrate open sessions:', error);
      }
    },

    loadFromHistory: async (projectId, chatSessionId, shouldContinue) => {
      // Mark the session hydrated even when loading fails, so the UI stops
      // showing a loading placeholder, and surface the failure on the
      // session's error banner.
      const markHydrationFailed = (message: string) => {
        const state = get();
        const existing = state.sessions.get(chatSessionId);
        if (!existing) return;
        const sessions = new Map(state.sessions);
        sessions.set(chatSessionId, { ...existing, hydrated: true, error: message });
        set({ sessions });
      };

      try {
        const result = await loadChatSession(projectId, chatSessionId);
        if (!isCurrent(shouldContinue)) return;

        if (result.success && result.messages) {
              id: m.id,
              role: m.role,

          const state = get();
          const sessions = new Map(state.sessions);
          const existingSession = sessions.get(chatSessionId);
          const baseSession = existingSession ?? createInitialPerSessionState(state.nextSessionNumber);
          const preserveLiveState =
            existingSession?.isStreaming ||
            existingSession?.sessionState === 'processing' ||
            existingSession?.sessionState === 'connecting';

          sessions.set(chatSessionId, {
            ...baseSession,
            messages,
            streamingContent: preserveLiveState ? baseSession.streamingContent : '',
            streamingThinking: preserveLiveState ? baseSession.streamingThinking : '',
            streamingSegments: preserveLiveState ? baseSession.streamingSegments : [],
            pendingActivities: preserveLiveState ? baseSession.pendingActivities : [],
            isStreaming: preserveLiveState ? baseSession.isStreaming : false,
            error: null,
            activities: preserveLiveState ? baseSession.activities : [],
            sessionState: baseSession.sessionState,
            streamStartedAt: preserveLiveState ? baseSession.streamStartedAt : null,
            lastStreamUpdateAt: preserveLiveState ? baseSession.lastStreamUpdateAt : null,
            hydrated: true,
          });

          if (!isCurrent(shouldContinue)) return;

          set({
            sessions,
            viewedSessionId: chatSessionId,
            nextSessionNumber: existingSession ? state.nextSessionNumber : state.nextSessionNumber + 1,
          });
        } else {
          markHydrationFailed(result.error || 'Failed to load conversation history');
        }
      } catch (error) {
        console.error('[ChatStore] Failed to load session from history:', error);
        if (!isCurrent(shouldContinue)) return;
        markHydrationFailed('Failed to load conversation history');
      }
    },

  };
}
