import type { ChatState, ChatSet, ChatGet } from './types';
import { streamingBuffer } from './utils';
import { applyStreamEvent } from './chatStreamReducer';
import { BACKGROUND_STREAMING_THROTTLE_MS, VIEWED_STREAMING_THROTTLE_MS } from '../../utils/streamingBuffer';

function updateSession(set: ChatSet, chatSessionId: string, event: Parameters<typeof applyStreamEvent>[1]): void {
  set((state) => {
    const session = state.sessions.get(chatSessionId);
    if (!session) return state;

    const nextSession = applyStreamEvent(session, event);
    if (nextSession === session) return state;

    const sessions = new Map(state.sessions);
    sessions.set(chatSessionId, nextSession);
    return { sessions };
  });
}

export function createStreamingSlice(set: ChatSet, get: ChatGet): Pick<ChatState,
  'appendChunk' | 'appendThinking' | 'flushStreamingContent' | 'finalizeMessage' | 'addActivity' | 'updateActivity'
> {
  return {
    appendChunk: (chatSessionId, chunk, _segmentId = 0, precedingActivities) => {
      if (precedingActivities && precedingActivities.length > 0) {
        updateSession(set, chatSessionId, { type: 'queue-activities', activities: precedingActivities });
      }

      const isViewed = get().viewedSessionId === chatSessionId;
      const intervalMs = isViewed ? VIEWED_STREAMING_THROTTLE_MS : BACKGROUND_STREAMING_THROTTLE_MS;

      streamingBuffer.append(chatSessionId, chunk, (buffered) => {
        updateSession(set, chatSessionId, { type: 'chunk', text: buffered });
      }, intervalMs);
    },

    appendThinking: (chatSessionId, text) => updateSession(set, chatSessionId, { type: 'thinking', text }),

    flushStreamingContent: (chatSessionId) => {
      const buffered = streamingBuffer.flush(chatSessionId);
      if (buffered) {
        updateSession(set, chatSessionId, { type: 'flush', text: buffered });
      }
    },

    finalizeMessage: (chatSessionId, options) => {
      const buffered = streamingBuffer.flush(chatSessionId);

      set((state) => {
        const session = state.sessions.get(chatSessionId);
        if (!session) {
          console.warn(`[finalizeMessage] Session not found: ${chatSessionId}`);
          return state;
        }

        const nextSession = applyStreamEvent(session, { type: 'done', options, buffered });
        if (nextSession === session) return state;

        const sessions = new Map(state.sessions);
        sessions.set(chatSessionId, nextSession);
        return { sessions };
      });
    },

    addActivity: (chatSessionId, activity) => updateSession(set, chatSessionId, { type: 'activity-start', activity }),

    updateActivity: (chatSessionId, activity) => updateSession(set, chatSessionId, { type: 'activity-update', activity }),
  };
}
