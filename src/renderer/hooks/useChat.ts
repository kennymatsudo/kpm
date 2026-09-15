import { useMemo } from 'react';
import { useChatStore, useProjectUiDomainStore } from '../stores';
import type { ChatViewMode } from '../../shared/types';
import {
  cancelChatSession,
  cancelQueuedChatMessage,
  sendChatMessage,
} from '../services/chatService';
import { createChatSender, type ChatSender } from '../chat/chatSender';

/**
 * Binds `createChatSender` to the live stores and chat IPC services for one
 * project. Turn-start policy lives in the sender; this hook only adapts it to
 * the component lifecycle.
 */
export function useChat(projectId: string | null, currentView?: ChatViewMode): ChatSender {
  return useMemo(() => createChatSender({
    projectId,
    currentView,
    getChatState: () => useChatStore.getState(),
    getFocusedResources: (chatSessionId) => {
      const { focusedResources, focusedResourcesBySession } = useProjectUiDomainStore.getState();
      return focusedResourcesBySession[chatSessionId] ?? focusedResources;
    },
    services: { sendChatMessage, cancelChatSession, cancelQueuedChatMessage },
  }), [projectId, currentView]);
}
