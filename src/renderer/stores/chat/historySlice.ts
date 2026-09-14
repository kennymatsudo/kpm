import type { ChatMessage, ChatSessionSummary } from '../../../shared/types';
import { getChatSessionHistory, loadChatSession } from '../../services/chatService';
import type { ChatState, ChatSet, ChatGet, Message, PerSessionState } from './types';
import { createInitialPerSessionState } from './baseState';
import { readPersistedTabs } from './persistence';
import { mergeAssistantTurns } from './messageMerge';
import { createIdleStreamingCluster } from './chatStreamReducer';

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
    startNewChatSession: () => {
      const newSessionId = crypto.randomUUID();
      const state = get();

      const newSession = createInitialPerSessionState(state.nextSessionNumber);
      const sessions = new Map(state.sessions);
      sessions.set(newSessionId, newSession);

      set({
        sessions,
        viewedSessionId: newSessionId,
        nextSessionNumber: state.nextSessionNumber + 1,
      });
      if (state.persistedProjectId) {
        void get().openChatChoice(state.persistedProjectId, newSessionId);
      }

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
          createInitialPerSessionState(state.nextSessionNumber)
        );
        set({
          sessions,
          nextSessionNumber: state.nextSessionNumber + 1,
        });
        if (state.persistedProjectId) {
          void get().openChatChoice(state.persistedProjectId, state.viewedSessionId);
        }
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
          if (get().sessions.size === 0) get().startNewChatSession();
          return;
        }

        const state = get();
        const sessions = new Map(state.sessions);
        let nextSessionNumber = state.nextSessionNumber;
        const newlyAdded: string[] = [];

        for (const id of persisted.open) {
          if (sessions.has(id)) continue;
          const shell: PerSessionState = {
            ...createInitialPerSessionState(nextSessionNumber),
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

      const ensureChoiceHydrated = async () => {
        if (!isCurrent(shouldContinue)) return;
        if (get().sessions.get(chatSessionId)?.choice) return;
        await get().openChatChoice(projectId, chatSessionId);
      };

      try {
        const result = await loadChatSession(projectId, chatSessionId);
        if (!isCurrent(shouldContinue)) return;

        if (result.success && result.messages) {
          // Fold consecutive assistant rows (no user row between them) into one
          // Message via `mergeAssistantTurns` (messageMerge.ts) — the same
          // predicate the live session uses in `chatStreamReducer.ts` —
          // otherwise reloaded history would show the old chunky per-turn
          // cards while a live session renders them merged. `interrupted` is
          // never passed here: `ChatMessage` doesn't persist it, so a
          // reloaded run always merges as if uninterrupted (see
          // `messageMerge.ts` for the tradeoff).
          const messages: Message[] = result.messages.reduce<Message[]>((acc, m: ChatMessage) => {
            const timestamp = new Date(m.created_at);

            if (m.role === 'assistant') {
              const merged = mergeAssistantTurns(acc[acc.length - 1], {
                segments: [{ type: 'text', content: m.content }],
                timestamp: timestamp.getTime(),
                model: m.model ?? undefined,
              });
              if (merged) {
                acc[acc.length - 1] = merged;
                return acc;
              }
            }

            acc.push({
              id: m.id,
              role: m.role,
              segments: [{ type: 'text', content: m.content }],
              timestamp,
              model: m.model ?? undefined,
            });
            return acc;
          }, []);

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
            // A live turn's streaming cluster (all 8 fields, as one unit)
            // survives a history reload untouched; otherwise it resets to
            // idle — same shape a fresh session starts in.
            ...(preserveLiveState ? {} : createIdleStreamingCluster()),
            error: null,
            sessionState: baseSession.sessionState,
            choice: result.choice ?? baseSession.choice,
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
        await ensureChoiceHydrated();
      } catch (error) {
        console.error('[ChatStore] Failed to load session from history:', error);
        if (!isCurrent(shouldContinue)) return;
        markHydrationFailed('Failed to load conversation history');
        await ensureChoiceHydrated();
      }
    },

  };
}
