import { useCallback } from 'react';
import { useChatStore, useProjectUiDomainStore } from '../stores';
import { useShallow } from 'zustand/react/shallow';
import type { ChatAttachment, ChatViewMode } from '../../shared/types';
import {
  cancelChatSession,
  cancelQueuedChatMessage,
  disconnectChatSession,
  sendChatMessage,
  startNewBackendChatSession,
} from '../services/chatService';

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

/**
 * Chat hook for managing unified chat sessions.
 * Chat is shared between Plan and Workspace views.
 * Supports multiple concurrent sessions per project.
 *
 * @param projectId - Current project ID
 * @param currentView - Optional view mode for prompt customization ('plan' or 'workspace')
 */
export function useChat(projectId: string | null, currentView?: ChatViewMode) {
  const {
    addUserMessage,
    setError,
    setRetrying,
    finalizeMessage,
    markSessionInactive,
    viewedSessionId,
    getChatSessionId,
    getOrCreateSession,
    startNewChatSession,
    removeQueuedUserMessage,
  } = useChatStore(useShallow((state) => ({
    addUserMessage: state.addUserMessage,
    setError: state.setError,
    setRetrying: state.setRetrying,
    finalizeMessage: state.finalizeMessage,
    markSessionInactive: state.markSessionInactive,
    viewedSessionId: state.viewedSessionId,
    getChatSessionId: state.getChatSessionId,
    getOrCreateSession: state.getOrCreateSession,
    startNewChatSession: state.startNewChatSession,
    removeQueuedUserMessage: state.removeQueuedUserMessage,
  })));

  const send = useCallback(async (
    message: string,
    attachments?: ChatAttachment[],
    clientMessageId?: string,
    targetChatSessionId?: string
  ) => {
    if (!projectId) return;

    // Get or create chat session ID
    const chatSessionId = targetChatSessionId ?? getChatSessionId();
    const effectiveClientMessageId = clientMessageId ?? crypto.randomUUID();

    // Ensure session exists in store
    getOrCreateSession(chatSessionId);

    let currentSession = useChatStore.getState().sessions.get(chatSessionId);
    if (!currentSession?.choice) {
      await useChatStore.getState().openChatChoice(projectId, chatSessionId);
      currentSession = useChatStore.getState().sessions.get(chatSessionId);
    }
    if (!currentSession?.choice) return effectiveClientMessageId;
    if (!currentSession.choice.send.allowed) {
      setError(chatSessionId, currentSession.choice.send.reason ?? 'Choose an available model before sending.');
      return effectiveClientMessageId;
    }

    // If the session is already streaming, queue this message behind the
    // in-flight turn rather than interrupting it. The user bubble appears
    // immediately with a "queued" indicator; the backend pushes the message
    // into the SDK's input generator, which pulls it when the current turn
    // finishes.
    const sendingWhileStreaming = !!currentSession.isStreaming;

    addUserMessage(
      chatSessionId,
      message,
      attachments,
      {
        queued: sendingWhileStreaming,
        liveFollowUp: sendingWhileStreaming,
        clientMessageId: effectiveClientMessageId,
      },
    );

    // Resolve context for the specific chat session (session-scoped "Add to context").
    const { focusedResources, focusedResourcesBySession } = useProjectUiDomainStore.getState();
    const sessionFocusedResources = focusedResourcesBySession[chatSessionId] ?? focusedResources;

    // Phase 2 keeps the IPC wire format unchanged (`tempImages: string[]`);
    // the main process re-classifies each path via extension sniffing.
    const tempImages = attachments && attachments.length > 0
      ? attachments.map((a) => a.path)
      : undefined;

    let sendResult: Awaited<ReturnType<typeof sendChatMessage>>;
    try {
      sendResult = await sendChatMessage({
        projectId,
        message,
        focusedResources: sessionFocusedResources,
        tempImages,
        chatSessionId,
        currentView,
        clientMessageId: effectiveClientMessageId,
      });
    } catch (error) {
      if (sendingWhileStreaming) {
        removeQueuedUserMessage(chatSessionId, effectiveClientMessageId);
      } else {
        setError(chatSessionId, getErrorMessage(error, 'Failed to send message'));
      }
      return effectiveClientMessageId;
    }

    // If the backend rejected the live follow-up, pull the optimistic bubble
    // back out of the transcript and surface why — silently dropping the
    // bubble reads as a glitch.
    if (sendingWhileStreaming && sendResult && 'success' in sendResult && !sendResult.success) {
      removeQueuedUserMessage(chatSessionId, effectiveClientMessageId);
      setError(chatSessionId, sendResult.error ?? 'Could not add your message. Please try again.');
    }
    if (!sendingWhileStreaming && sendResult && 'success' in sendResult && !sendResult.success) {
      setError(chatSessionId, sendResult.error ?? 'Failed to send message');
    }

    return effectiveClientMessageId;
  }, [projectId, currentView, addUserMessage, getChatSessionId, getOrCreateSession, removeQueuedUserMessage, setError]);

  const retry = useCallback(async (message: string, clientMessageId: string, tempImages?: string[]) => {
    if (!projectId) return;

    // Get or create chat session ID
    const chatSessionId = getChatSessionId();

    // Ensure session exists in store
    getOrCreateSession(chatSessionId);

    // Re-enter streaming state without adding a duplicate user message
    setRetrying(chatSessionId);

    // Resolve context for the specific chat session (session-scoped "Add to context").
    const { focusedResources, focusedResourcesBySession } = useProjectUiDomainStore.getState();
    const sessionFocusedResources = focusedResourcesBySession[chatSessionId] ?? focusedResources;

    const retrySessionState = useChatStore.getState().sessions.get(chatSessionId);
    if (!retrySessionState?.choice) await useChatStore.getState().openChatChoice(projectId, chatSessionId);
    const authoritative = useChatStore.getState().sessions.get(chatSessionId)?.choice;
    if (!authoritative?.send.allowed) {
      setError(chatSessionId, authoritative?.send.reason ?? 'Choose an available model before sending.');
      return;
    }

    try {
      const result = await sendChatMessage({
        projectId,
        message,
        focusedResources: sessionFocusedResources,
        tempImages,
        chatSessionId,
        currentView,
        clientMessageId,
      });
      if (!result.success) {
        setError(chatSessionId, result.error ?? 'Failed to retry message');
      }
    } catch (error) {
      setError(chatSessionId, getErrorMessage(error, 'Failed to retry message'));
    }
  }, [projectId, currentView, getChatSessionId, getOrCreateSession, setRetrying, setError]);

  const newSession = useCallback(async (keepCurrentActive = true) => {
    if (!projectId) return;

    if (!keepCurrentActive && viewedSessionId) {
      // End current session before starting new one
      await disconnectChatSession(projectId, viewedSessionId);
    }

    // Start a new chat session in the store
    const newSessionId = startNewChatSession(keepCurrentActive);

    // Reset tokens for new session
    await startNewBackendChatSession(projectId);

    return newSessionId;
  }, [projectId, viewedSessionId, startNewChatSession]);

  const cancel = useCallback(() => {
    if (!projectId || !viewedSessionId) return;

    // Immediately finalize UI for the viewed session, marking the partial
    // assistant response as interrupted so the bubble shows an indicator.
    finalizeMessage(viewedSessionId, { interrupted: true });

    // Backend cleanup happens in background - don't await
    cancelChatSession(projectId, viewedSessionId).catch((err: unknown) => {
      console.error('[useChat] Cancel failed:', err);
    });
  }, [projectId, viewedSessionId, finalizeMessage]);

  /**
   * Cancel a queued follow-up before the SDK pulls it. Wait for the backend
   * queue-cleared event before removing the bubble so a turn-boundary race
   * cannot drop a message that has already been sent.
   */
  const cancelQueued = useCallback((clientMessageId: string) => {
    if (!projectId || !viewedSessionId) return;
    cancelQueuedChatMessage(projectId, viewedSessionId, clientMessageId).then((result) => {
      if (!result.success) {
        useChatStore.getState().clearQueuedFlag(viewedSessionId, clientMessageId);
      }
    }).catch((err: unknown) => {
      console.error('[useChat] Cancel queued failed:', err);
      useChatStore.getState().clearQueuedFlag(viewedSessionId, clientMessageId);
    });
  }, [projectId, viewedSessionId]);

  const closeSession = useCallback(async (chatSessionId: string) => {
    if (!projectId) return;
    await disconnectChatSession(projectId, chatSessionId);
    markSessionInactive(chatSessionId);
  }, [projectId, markSessionInactive]);

  return { send, retry, newSession, cancel, cancelQueued, closeSession };
}
