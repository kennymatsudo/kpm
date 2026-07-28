export type WriteDecision = { allowed: true } | { allowed: false; reason: string };

type WriteGrantListener = (chatSessionId: string, granted: boolean) => void;

export interface ConversationWriteGrants {
  request(
    chatSessionId: string | undefined,
    requestConsent: () => Promise<boolean>,
  ): Promise<WriteDecision>;
  has(chatSessionId: string): boolean;
  revoke(chatSessionId: string): void;
  subscribe(listener: WriteGrantListener): () => void;
}

const NO_SESSION_REASON =
  'Writing from chat needs the user to allow writes for the conversation, and this run has no chat session to ask in.';

export function createConversationWriteGrants(): ConversationWriteGrants {
  const grantedChatSessions = new Set<string>();
  const pendingRequests = new Map<string, Promise<WriteDecision>>();
  const listeners = new Set<WriteGrantListener>();

  const publish = (chatSessionId: string, granted: boolean): void => {
    for (const listener of listeners) listener(chatSessionId, granted);
  };

  return {
    async request(chatSessionId, requestConsent) {
      if (!chatSessionId) return { allowed: false, reason: NO_SESSION_REASON };
      if (grantedChatSessions.has(chatSessionId)) return { allowed: true };

      const pending = pendingRequests.get(chatSessionId);
      if (pending) return pending;

      const request = (async (): Promise<WriteDecision> => {
        if (!await requestConsent()) {
          return {
            allowed: false,
            reason: 'The user did not allow writes for this conversation. Do not retry; explain what you would have changed instead.',
          };
        }

        grantedChatSessions.add(chatSessionId);
        publish(chatSessionId, true);
        return { allowed: true };
      })();

      pendingRequests.set(chatSessionId, request);
      try {
        return await request;
      } finally {
        if (pendingRequests.get(chatSessionId) === request) {
          pendingRequests.delete(chatSessionId);
        }
      }
    },

    has(chatSessionId) {
      return grantedChatSessions.has(chatSessionId);
    },

    revoke(chatSessionId) {
      if (!grantedChatSessions.delete(chatSessionId)) return;
      publish(chatSessionId, false);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const conversationWriteGrants = createConversationWriteGrants();
