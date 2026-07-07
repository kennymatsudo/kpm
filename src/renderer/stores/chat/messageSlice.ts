import type { ChatState, ChatSet, ChatGet, Message, PerSessionState } from './types';
import { createInitialPerSessionState, createInitialChatState } from './baseState';
import { streamingBuffer } from './utils';
import { applyStreamEvent } from './chatStreamReducer';

export function createMessageSlice(set: ChatSet, _get: ChatGet): Pick<ChatState,
  'addUserMessage' | 'clearQueuedFlag' | 'removeQueuedUserMessage' | 'setRetrying' | 'setError' | 'clearError' | 'setDraftMessage' | 'setPendingAttachments' | 'setSuggestions' | 'setClaudeSessionId' | 'setSessionTitle' | 'setMcpStatus' | 'setLastTurnUsage' | 'setSessionState' | 'reset' | 'resetProjectState'
> {
  return {
    addUserMessage: (chatSessionId, content, attachments, options) => set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(chatSessionId) ?? createInitialPerSessionState(state.nextSessionNumber);
      const now = Date.now();
      const isQueued = options?.queued ?? false;

      const newUserMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        segments: [{ type: 'text', content }],
        timestamp: new Date(),
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
        ...(options?.clientMessageId ? { clientMessageId: options.clientMessageId } : {}),
        ...(isQueued ? { queued: true } : {}),
        ...(options?.liveFollowUp ? { liveFollowUp: true } : {}),
      };

      // Live follow-ups slip in behind a still-streaming turn — preserve the
      // in-flight assistant state so the response can finish naturally and
      // its bubble doesn't get blown away.
      const nextSession: PerSessionState = isQueued
        ? { ...session, messages: [...session.messages, newUserMessage] }
        : {
            ...session,
            messages: [...session.messages, newUserMessage],
            isStreaming: true,
            streamingContent: '',
            streamingThinking: '',
            streamingSegments: [],
            pendingActivities: [],
            error: null,
            activities: [],
            suggestions: [],
            streamStartedAt: now,
            lastStreamUpdateAt: now,
          };

      sessions.set(chatSessionId, nextSession);

      return {
        sessions,
        nextSessionNumber: sessions.has(chatSessionId) ? state.nextSessionNumber : state.nextSessionNumber + 1,
      };
    }),

    clearQueuedFlag: (chatSessionId, clientMessageId) => set((state) => {
      const session = state.sessions.get(chatSessionId);
      if (!session) return state;

      const nextSession = applyStreamEvent(session, { type: 'queue-cleared-already-sent', clientMessageId });
      if (nextSession === session) return state;

      const sessions = new Map(state.sessions);
      sessions.set(chatSessionId, nextSession);
      return { sessions };
    }),

    removeQueuedUserMessage: (chatSessionId, clientMessageId) => set((state) => {
      const session = state.sessions.get(chatSessionId);
      if (!session) return state;

      const nextSession = applyStreamEvent(session, { type: 'queue-cleared-dropped', clientMessageId });
      if (nextSession === session) return state;

      const sessions = new Map(state.sessions);
      sessions.set(chatSessionId, nextSession);
      return { sessions };
    }),

    setRetrying: (chatSessionId) => set((state) => {
      const session = state.sessions.get(chatSessionId);
      if (!session) return state;

      const sessions = new Map(state.sessions);
      sessions.set(chatSessionId, applyStreamEvent(session, { type: 'retry' }));
      return { sessions };
    }),

    setError: (chatSessionId, error) => {
      streamingBuffer.clear(chatSessionId);

      set((state) => {
        const session = state.sessions.get(chatSessionId);
        if (!session) return state;

        const sessions = new Map(state.sessions);
        sessions.set(chatSessionId, applyStreamEvent(session, { type: 'error', error }));
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
            ...createInitialPerSessionState(state.nextSessionNumber),
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

    setPendingAttachments: (chatSessionId, pendingAttachments) => set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(chatSessionId);
      if (!session) {
        sessions.set(
          chatSessionId,
          {
            ...createInitialPerSessionState(state.nextSessionNumber),
            pendingAttachments,
          }
        );
        return {
          sessions,
          nextSessionNumber: state.nextSessionNumber + 1,
        };
      }

      sessions.set(chatSessionId, { ...session, pendingAttachments });
      return { sessions };
    }),

    setSuggestions: (chatSessionId, suggestions) => set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(chatSessionId);
      if (!session) return state;

      sessions.set(chatSessionId, { ...session, suggestions });
      return { sessions };
    }),

    setClaudeSessionId: (chatSessionId, claudeSessionId) => set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(chatSessionId);
      if (!session) return state;

      sessions.set(chatSessionId, { ...session, claudeSessionId });
      return { sessions };
    }),

    setSessionTitle: (chatSessionId, title) => set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(chatSessionId);
      if (!session) return state;

      const trimmed = title.trim();
      sessions.set(chatSessionId, { ...session, title: trimmed.length > 0 ? trimmed : null });
      return { sessions };
    }),

    setMcpStatus: (chatSessionId, degraded, error) => set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(chatSessionId);
      if (!session) return state;

      sessions.set(chatSessionId, { ...session, mcpDegraded: degraded, mcpError: error ?? null });
      return { sessions };
    }),

    setLastTurnUsage: (chatSessionId, usage) => set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(chatSessionId);
      if (!session) return state;

      sessions.set(chatSessionId, { ...session, lastTurnUsage: usage });
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
      streamingBuffer.clearAll();
      set(createInitialChatState());
    },

    resetProjectState: () => {
      streamingBuffer.clearAll();
      set((state) => ({
        ...createInitialChatState(),
        model: state.model,
      }));
    },
  };
}
