import type { ChatState, ChatSet, ChatGet, Message, PerSessionState } from './types';
import { createInitialPerSessionState, createInitialChatState } from './baseState';
import { streamingBuffer } from './utils';

export function createMessageSlice(set: ChatSet, get: ChatGet): Pick<ChatState,
> {
  return {
    addUserMessage: (chatSessionId, content, attachments, options) => set((state) => {
      const sessions = new Map(state.sessions);
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
      };

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
      const sessions = new Map(state.sessions);
      const session = sessions.get(chatSessionId);
      if (!session) return state;

      // Find the message to clear. If a clientMessageId was supplied, target
      // that specific message; otherwise clear the most recent queued user
      // message (covers callers that don't track ids — e.g. legacy paths).
      let touched = false;
      const messages = session.messages.map((m) => {
        if (touched) return m;
        if (m.role !== 'user' || !m.queued) return m;
        if (clientMessageId && m.clientMessageId !== clientMessageId) return m;
        touched = true;
        const { queued: _queued, ...rest } = m;
        return rest;
      });

      if (!touched) return state;
      sessions.set(chatSessionId, { ...session, messages });
      return { sessions };
    }),

    removeQueuedUserMessage: (chatSessionId, clientMessageId) => set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(chatSessionId);
      if (!session) return state;

      const idx = session.messages.findIndex(
      );
      if (idx === -1) return state;

      const messages = [...session.messages.slice(0, idx), ...session.messages.slice(idx + 1)];
      sessions.set(chatSessionId, { ...session, messages });
      return { sessions };
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
        streamingThinking: '',
        streamingSegments: [],
        pendingActivities: [],
        streamStartedAt: now,
        lastStreamUpdateAt: now,
        suggestions: [],
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

    setPendingAttachments: (chatSessionId, pendingAttachments) => set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(chatSessionId);
      if (!session) {
        sessions.set(
          chatSessionId,
          {
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
