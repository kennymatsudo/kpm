import { useCallback, useEffect, useState } from 'react';
import type { MainView } from '../MainViewSwitcher';

type ChatCollapseView = 'planning' | 'workspace';

export interface UsePersistedChatCollapseStateReturn {
  chatCollapsed: boolean;
  workspaceChatCollapsed: boolean;
  handleToggleChat: () => void;
  showWorkspaceChat: () => void;
}

function readStoredChatCollapsed(projectId: string | null, view: ChatCollapseView): boolean {
  if (!projectId) {
    return view === 'planning';
  }

  try {
    const stored = localStorage.getItem(`kpm-chat-collapsed-${view}-${projectId}`);
    if (stored === null) {
      return view === 'planning';
    }

    return stored === 'true';
  } catch (error) {
    console.warn('[Layout] Failed to read chat collapse state:', error);
    return view === 'planning';
  }
}

function persistChatCollapsed(projectId: string | null, view: ChatCollapseView, collapsed: boolean) {
  if (!projectId) return;

  try {
    localStorage.setItem(`kpm-chat-collapsed-${view}-${projectId}`, String(collapsed));
  } catch (error) {
    console.warn('[Layout] Failed to persist chat collapse state:', error);
  }
}

export function usePersistedChatCollapseState(
  projectId: string | null,
  mainView: MainView
): UsePersistedChatCollapseStateReturn {
  const [planChatCollapsed, setPlanChatCollapsed] = useState(() =>
    readStoredChatCollapsed(projectId, 'planning')
  );
  const [workspaceChatCollapsed, setWorkspaceChatCollapsed] = useState(() =>
    readStoredChatCollapsed(projectId, 'workspace')
  );

  useEffect(() => {
    setPlanChatCollapsed(readStoredChatCollapsed(projectId, 'planning'));
    setWorkspaceChatCollapsed(readStoredChatCollapsed(projectId, 'workspace'));
  }, [projectId]);

  const handleToggleChat = useCallback(() => {
    if (mainView === 'workspace') {
      setWorkspaceChatCollapsed((current) => {
        const next = !current;
        persistChatCollapsed(projectId, 'workspace', next);
        return next;
      });
      return;
    }

    if (mainView === 'planning') {
      setPlanChatCollapsed((current) => {
        const next = !current;
        persistChatCollapsed(projectId, 'planning', next);
        return next;
      });
    }
  }, [mainView, projectId]);

  const showWorkspaceChat = useCallback(() => {
    setWorkspaceChatCollapsed(false);
    persistChatCollapsed(projectId, 'workspace', false);
  }, [projectId]);

  return {
    chatCollapsed: mainView === 'workspace' ? workspaceChatCollapsed : planChatCollapsed,
    workspaceChatCollapsed,
    handleToggleChat,
    showWorkspaceChat,
  };
}
