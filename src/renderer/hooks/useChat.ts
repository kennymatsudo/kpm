
/**
 * Chat hook for managing unified chat sessions.
 * Chat is shared between Plan and Workspace views.
 *
 * @param projectId - Current project ID
 * @param currentView - Optional view mode for prompt customization ('plan' or 'workspace')
 */
export function useChat(projectId: string | null, currentView?: ChatViewMode) {
  const {
    addUserMessage,

    if (!projectId) return;

    if (!projectId) return;

    // Backend cleanup happens in background - don't await
      console.error('[useChat] Cancel failed:', err);
    });

}
