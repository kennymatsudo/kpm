import type { ChatAttachment, ChatViewMode, FocusedResource } from '../../shared/types';
import type { ChatState } from '../stores/chat/types';

/** The slice of the chat store the sender reads and drives. */
export type ChatSenderStoreView = Pick<
  ChatState,
  | 'sessions'
  | 'viewedSessionId'
  | 'getChatSessionId'
  | 'getOrCreateSession'
  | 'openChatChoice'
  | 'addUserMessage'
  | 'removeQueuedUserMessage'
  | 'clearQueuedFlag'
  | 'finalizeMessage'
  | 'setRetrying'
  | 'setError'
>;

export type ChatSendOutcome = { success: true } | { success: false; error: string };

export interface ChatSenderServices {
  sendChatMessage: (params: {
    projectId: string;
    message: string;
    focusedResources: FocusedResource[];
    tempImages?: string[];
    chatSessionId: string;
    currentView?: ChatViewMode;
    clientMessageId: string;
  }) => Promise<ChatSendOutcome>;
  cancelChatSession: (projectId: string, chatSessionId: string) => Promise<unknown>;
  cancelQueuedChatMessage: (
    projectId: string,
    chatSessionId: string,
    clientMessageId?: string,
  ) => Promise<ChatSendOutcome>;
}

export interface ChatSenderDeps {
  projectId: string | null;
  currentView?: ChatViewMode;
  getChatState: () => ChatSenderStoreView;
  getFocusedResources: (chatSessionId: string) => FocusedResource[];
  services: ChatSenderServices;
}

export interface ChatSender {
  /**
   * Start or queue a turn. Resolves the chat session itself when no target is
   * given, and resolves to the client message id the user bubble carries —
   * null only when there is no project. Never rejects: every failure is
   * reported through the session's error state instead.
   */
  send: (
    message: string,
    attachments?: ChatAttachment[],
    clientMessageId?: string,
    targetChatSessionId?: string,
  ) => Promise<string | null>;
  /** Re-send an existing user message without adding a second bubble for it. */
  retry: (message: string, clientMessageId: string, tempImages?: string[]) => Promise<void>;
  /** Interrupt the viewed session's turn. */
  cancel: () => void;
  /** Withdraw a follow-up that is still waiting behind a live turn. */
  cancelQueued: (clientMessageId: string) => void;
}

type PreparedTurn =
  | { ready: true; focusedResources: FocusedResource[]; turnInFlight: boolean }
  | { ready: false };

const CHOICE_UNAVAILABLE = 'Choose an available model before sending.';
const SEND_FAILED = 'Failed to send message';
const QUEUED_SEND_FAILED = 'Could not add your message. Please try again.';
const RETRY_FAILED = 'Failed to retry message';

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

/**
 * Owns turn-start policy for one project's chats: which model choice may send,
 * whether a message starts a turn or queues behind a live one, and how an
 * optimistic user bubble is rolled back when the backend refuses it.
 * Pure policy: no React, no direct store imports — `useChat` adapts it to the
 * component lifecycle.
 */
export function createChatSender(deps: ChatSenderDeps): ChatSender {
  const { projectId, currentView, getChatState, getFocusedResources, services } = deps;

  if (!projectId) {
    return {
      send: () => Promise.resolve(null),
      retry: () => Promise.resolve(),
      cancel: () => {},
      cancelQueued: () => {},
    };
  }

  /**
   * Everything a turn needs settled before it may reach the backend. The model
   * choice is authoritative only after `openChatChoice` resolves, so the store
   * is re-read rather than reusing the snapshot the await started from.
   */
  const prepareTurn = async (chatSessionId: string): Promise<PreparedTurn> => {
    getChatState().getOrCreateSession(chatSessionId);

    if (!getChatState().sessions.get(chatSessionId)?.choice) {
      await getChatState().openChatChoice(projectId, chatSessionId);
    }

    const choice = getChatState().sessions.get(chatSessionId)?.choice;
    if (!choice) return { ready: false };
    if (!choice.send.allowed) {
      getChatState().setError(chatSessionId, choice.send.reason ?? CHOICE_UNAVAILABLE);
      return { ready: false };
    }

    return {
      ready: true,
      focusedResources: getFocusedResources(chatSessionId),
      turnInFlight: !!getChatState().sessions.get(chatSessionId)?.isStreaming,
    };
  };

  /**
   * Pull the optimistic bubble back out of the transcript and say why. A
   * silently vanishing message reads as a glitch, and a queued one that never
   * reached the model must not be left looking sent.
   */
  const rollbackTurn = (
    chatSessionId: string,
    clientMessageId: string,
    wasQueued: boolean,
    error: string,
  ): void => {
    if (wasQueued) {
      getChatState().removeQueuedUserMessage(chatSessionId, clientMessageId);
    }
    getChatState().setError(chatSessionId, error);
  };

  const send: ChatSender['send'] = async (
    message,
    attachments,
    clientMessageId,
    targetChatSessionId,
  ) => {
    const chatSessionId = targetChatSessionId ?? getChatState().getChatSessionId();
    const effectiveClientMessageId = clientMessageId ?? crypto.randomUUID();

    const turn = await prepareTurn(chatSessionId);
    if (!turn.ready) return effectiveClientMessageId;

    // A live turn is never interrupted: the bubble appears at once with a
    // queued indicator while the backend holds the message for the SDK's input
    // generator to pull when the current turn finishes.
    const queuedBehindLiveTurn = turn.turnInFlight;

    getChatState().addUserMessage(chatSessionId, message, attachments, {
      queued: queuedBehindLiveTurn,
      liveFollowUp: queuedBehindLiveTurn,
      clientMessageId: effectiveClientMessageId,
    });

    // The IPC wire format stays `tempImages: string[]`; the main process
    // re-classifies each path by extension.
    const tempImages = attachments && attachments.length > 0
      ? attachments.map((attachment) => attachment.path)
      : undefined;

    let outcome: ChatSendOutcome;
    try {
      outcome = await services.sendChatMessage({
        projectId,
        message,
        focusedResources: turn.focusedResources,
        tempImages,
        chatSessionId,
        currentView,
        clientMessageId: effectiveClientMessageId,
      });
    } catch (error) {
      rollbackTurn(
        chatSessionId,
        effectiveClientMessageId,
        queuedBehindLiveTurn,
        describeError(error, queuedBehindLiveTurn ? QUEUED_SEND_FAILED : SEND_FAILED),
      );
      return effectiveClientMessageId;
    }

    if (!outcome.success) {
      rollbackTurn(chatSessionId, effectiveClientMessageId, queuedBehindLiveTurn, outcome.error);
    }

    return effectiveClientMessageId;
  };

  const retry: ChatSender['retry'] = async (message, clientMessageId, tempImages) => {
    const chatSessionId = getChatState().getChatSessionId();

    const turn = await prepareTurn(chatSessionId);
    if (!turn.ready) return;

    // Re-enter streaming without adding a second bubble for the same message.
    getChatState().setRetrying(chatSessionId);

    try {
      const outcome = await services.sendChatMessage({
        projectId,
        message,
        focusedResources: turn.focusedResources,
        tempImages,
        chatSessionId,
        currentView,
        clientMessageId,
      });
      if (!outcome.success) {
        getChatState().setError(chatSessionId, outcome.error);
      }
    } catch (error) {
      getChatState().setError(chatSessionId, describeError(error, RETRY_FAILED));
    }
  };

  const cancel: ChatSender['cancel'] = () => {
    const { viewedSessionId, finalizeMessage } = getChatState();
    if (!viewedSessionId) return;

    // Mark the partial response interrupted right away; backend teardown runs
    // in the background.
    finalizeMessage(viewedSessionId, { interrupted: true });

    services.cancelChatSession(projectId, viewedSessionId).catch((error: unknown) => {
      console.error('[chatSender] Cancel failed:', error);
    });
  };

  const cancelQueued: ChatSender['cancelQueued'] = (clientMessageId) => {
    const { viewedSessionId } = getChatState();
    if (!viewedSessionId) return;

    // The bubble stays until the backend confirms the message was pulled from
    // the queue, so a turn-boundary race cannot drop a message already sent.
    services.cancelQueuedChatMessage(projectId, viewedSessionId, clientMessageId)
      .then((outcome) => {
        if (!outcome.success) {
          getChatState().clearQueuedFlag(viewedSessionId, clientMessageId);
        }
      })
      .catch((error: unknown) => {
        console.error('[chatSender] Cancel queued failed:', error);
        getChatState().clearQueuedFlag(viewedSessionId, clientMessageId);
      });
  };

  return { send, retry, cancel, cancelQueued };
}
