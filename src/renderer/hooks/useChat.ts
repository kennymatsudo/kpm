import { useCallback } from 'react';
import { useChatStore, useProjectUiDomainStore } from '../stores';
import { useShallow } from 'zustand/react/shallow';

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

    if (!projectId) return;

    // Get or create chat session ID
    const effectiveClientMessageId = clientMessageId ?? crypto.randomUUID();

    // Ensure session exists in store
    getOrCreateSession(chatSessionId);


    // Resolve context for the specific chat session (session-scoped "Add to context").
    const { focusedResources, focusedResourcesBySession } = useProjectUiDomainStore.getState();
    const sessionFocusedResources = focusedResourcesBySession[chatSessionId] ?? focusedResources;


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
    }

    // Start a new chat session in the store
    const newSessionId = startNewChatSession(keepCurrentActive);

    // Reset tokens for new session

    return newSessionId;
  }, [projectId, viewedSessionId, startNewChatSession]);

  const cancel = useCallback(() => {
    if (!projectId || !viewedSessionId) return;


    // Backend cleanup happens in background - don't await
      console.error('[useChat] Cancel failed:', err);
    });

  const closeSession = useCallback(async (chatSessionId: string) => {
    if (!projectId) return;
    markSessionInactive(chatSessionId);
  }, [projectId, markSessionInactive]);

}
