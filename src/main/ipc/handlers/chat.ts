import type { ChatService } from '../../services/core/ChatService';
import type { SlashCommandService } from '../../services/core/SlashCommandService';
import { chatEndpoints, type ChatEndpointName } from '../../../shared/ipc/chatEndpoints';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';
import { ChatSendSchema } from '../validation/chat';
import { createRegistryIpcHandlers } from '../validation/utils';

/**
 * One handler per `chatEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type ChatHandlers = { [K in ChatEndpointName]: UnwrappedHandlerFor<typeof chatEndpoints, K> };

function buildChatHandlers(chatService: ChatService, slashCommandService: SlashCommandService): ChatHandlers {
  return {
    getSlashCommands: async () => {
      const result = slashCommandService.listCommands();
      if (!result.ok) throw new Error(result.error);
      return { commands: result.data };
    },

    send: async (params) => {
      const { focusedResources, currentView, focusDocument, ...input } = params;
      const result = await chatService.sendMessage(input, { focusedResources, currentView, focusDocument });
      if (!result.ok) throw new Error(result.error);
    },

    cancel: async ({ projectId, chatSessionId }) => {
      const result = await chatService.cancel(projectId, chatSessionId);
      if (!result.ok) throw new Error(result.error);
    },

    cancelQueued: async ({ projectId, chatSessionId, clientMessageId }) => {
      const result = chatService.cancelQueued(projectId, chatSessionId, clientMessageId);
      if (!result.ok) throw new Error(result.error);
    },

    newSession: async ({ projectId }) => {
      const result = chatService.newSession(projectId);
      if (!result.ok) throw new Error(result.error);
    },

    connectSession: async ({ projectId }) => {
      const result = chatService.connectSession(projectId);
      if (!result.ok) throw new Error(result.error);
    },

    disconnectSession: async ({ projectId }) => {
      const result = await chatService.disconnectSession(projectId);
      if (!result.ok) throw new Error(result.error);
    },

    getActiveSessions: async ({ projectId }) => {
      const result = chatService.getActiveSessions(projectId);
      if (!result.ok) throw new Error(result.error);
      return { sessions: result.data };
    },

    disconnectSpecificSession: async ({ projectId, chatSessionId }) => {
      const result = await chatService.disconnectSpecificSession(projectId, chatSessionId);
      if (!result.ok) throw new Error(result.error);
    },

    getSessionState: async ({ projectId, chatSessionId }) => {
      const result = chatService.getSessionState(projectId, chatSessionId);
      if (!result.ok) throw new Error(result.error);
      return { state: result.data };
    },

    getUsage: async ({ projectId }) => {
      const result = chatService.getUsage(projectId);
      if (!result.ok) throw new Error(result.error);
      return { usage: result.data };
    },

    getMessages: async ({ projectId }) => {
      const result = chatService.getMessages(projectId);
      if (!result.ok) throw new Error(result.error);
      return { messages: result.data };
    },

    getSessionHistory: async ({ projectId, limit }) => {
      const result = chatService.getSessionHistory(projectId, limit);
      if (!result.ok) throw new Error(result.error);
      return { sessions: result.data };
    },

    loadSession: async ({ projectId, chatSessionId }) => {
      const result = chatService.loadSession(projectId, chatSessionId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },

    getFocusDocumentSession: async (params) => {
      const result = await chatService.getOrCreateFocusDocumentSession(params);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  };
}

export function registerChatHandlers(chatService: ChatService, slashCommandService: SlashCommandService): void {
  // `ChatSendSchema` layers the temp-image-directory scoping refine that
  // the shared registry's `params` can't express (see `validation/chat.ts`),
  // so `send` parses through it instead of `chatEndpoints.send.params`.
  createRegistryIpcHandlers(
    chatEndpoints,
    buildChatHandlers(chatService, slashCommandService),
    'Chat operation failed',
    {
      send: ChatSendSchema,
    }
  );
}
