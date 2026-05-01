import { useCallback } from 'react';
import { useChatStore, useProjectUiDomainStore } from '../stores';
import { useShallow } from 'zustand/react/shallow';
import type { ChatAttachment, ChatViewMode } from '../../shared/types';
import {
  cancelChatSession,
  disconnectChatSession,
  sendChatMessage,
  startNewBackendChatSession,
} from '../services/chatService';

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
    setRetrying,
    finalizeMessage,
    markSessionInactive,
    viewedSessionId,
    getChatSessionId,
    getOrCreateSession,
    startNewChatSession,
  } = useChatStore(useShallow((state) => ({
    addUserMessage: state.addUserMessage,
    setRetrying: state.setRetrying,
    finalizeMessage: state.finalizeMessage,
    markSessionInactive: state.markSessionInactive,
    viewedSessionId: state.viewedSessionId,
    getChatSessionId: state.getChatSessionId,
    getOrCreateSession: state.getOrCreateSession,
    startNewChatSession: state.startNewChatSession,
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

    const currentSession = useChatStore.getState().sessions.get(chatSessionId);


    // Resolve context for the specific chat session (session-scoped "Add to context").
    const { focusedResources, focusedResourcesBySession } = useProjectUiDomainStore.getState();
    const sessionFocusedResources = focusedResourcesBySession[chatSessionId] ?? focusedResources;

    // Phase 2 keeps the IPC wire format unchanged (`tempImages: string[]`);
    // the main process re-classifies each path via extension sniffing.
    const tempImages = attachments && attachments.length > 0
      ? attachments.map((a) => a.path)
      : undefined;


    return effectiveClientMessageId;

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
      console.error('[useChat] Cancel failed:', err);
    });

  const closeSession = useCallback(async (chatSessionId: string) => {
    if (!projectId) return;
    await disconnectChatSession(projectId, chatSessionId);
    markSessionInactive(chatSessionId);
  }, [projectId, markSessionInactive]);

}
