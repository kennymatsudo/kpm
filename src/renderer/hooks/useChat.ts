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
    markSessionInactive,
    viewedSessionId,
    getChatSessionId,
    startNewChatSession,
  } = useChatStore(useShallow((state) => ({
    addUserMessage: state.addUserMessage,
    markSessionInactive: state.markSessionInactive,
    viewedSessionId: state.viewedSessionId,
    getChatSessionId: state.getChatSessionId,
    startNewChatSession: state.startNewChatSession,
  })));

    if (!projectId) return;

    // Get or create chat session ID

    // Ensure session exists in store
    getOrCreateSession(chatSessionId);




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
