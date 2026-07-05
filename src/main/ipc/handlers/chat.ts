import type { ChatService } from '../../services/core/ChatService';
import type { SlashCommandService } from '../../services/core/SlashCommandService';
import type { PermissionService } from '../../services/core/PermissionService';
import type { StreamingSessionService } from '../../services/streaming/StreamingSessionService';
import type { IChatMessageRepository, IProjectRepository } from '../../db/interfaces';
import { chatEndpoints, type ChatEndpointName } from '../../../shared/ipc/chatEndpoints';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';
import { ChatSendSchema } from '../validation/chat';
import { createRegistryIpcHandlers } from '../validation/utils';

export interface ChatHandlerDeps {
  chatService: ChatService;
  slashCommandService: SlashCommandService;
  permissionService: Pick<PermissionService, 'loadPersistedPermissions'>;
  streamingSessionService: Pick<
    StreamingSessionService,
    'interruptChatSession' | 'cancelQueuedChatMessage' | 'disconnectChatSession' | 'getActiveSessions' | 'getChatSessionState'
  >;
  projects: IProjectRepository;
  chatMessages: IChatMessageRepository;
}

/**
 * One handler per `chatEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 *
 * Behavioural endpoints delegate to ChatService; plain session reads and
 * session controls go straight to the repositories / StreamingSessionService.
 */
type ChatHandlers = { [K in ChatEndpointName]: UnwrappedHandlerFor<typeof chatEndpoints, K> };

function requireProject(projects: IProjectRepository, projectId: string): void {
  if (!projects.get(projectId)) {
    throw new Error('Project not found');
  }
}

function buildChatHandlers(deps: ChatHandlerDeps): ChatHandlers {
  const { chatService, slashCommandService, permissionService, streamingSessionService, projects, chatMessages } = deps;

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
      const result = await streamingSessionService.interruptChatSession(projectId, chatSessionId);
      if (!result.ok) throw new Error(result.error);
    },

    cancelQueued: async ({ projectId, chatSessionId, clientMessageId }) => {
      const result = streamingSessionService.cancelQueuedChatMessage(projectId, chatSessionId, clientMessageId);
      if (!result.ok) throw new Error(result.error);
    },

    newSession: async ({ projectId }) => {
      const result = chatService.newSession(projectId);
      if (!result.ok) throw new Error(result.error);
    },

    connectSession: async ({ projectId }) => {
      const result = permissionService.loadPersistedPermissions(projectId);
      if (!result.ok) throw new Error(result.error);
    },

    disconnectSession: async ({ projectId }) => {
      const result = await chatService.disconnectSession(projectId);
      if (!result.ok) throw new Error(result.error);
    },

    getActiveSessions: async ({ projectId }) => {
      return { sessions: streamingSessionService.getActiveSessions(projectId) };
    },

    disconnectSpecificSession: async ({ projectId, chatSessionId }) => {
      const result = await streamingSessionService.disconnectChatSession(projectId, chatSessionId);
      if (!result.ok) throw new Error(result.error);
    },

    getSessionState: async ({ projectId, chatSessionId }) => {
      return { state: streamingSessionService.getChatSessionState(projectId, chatSessionId) };
    },

    getUsage: async ({ projectId }) => {
      const project = projects.get(projectId);
      if (!project) {
        return { usage: { totalTokens: 0, inputTokens: 0, outputTokens: 0 } };
      }
      return {
        usage: {
          totalTokens: project.session_tokens,
          inputTokens: project.session_input_tokens,
          outputTokens: project.session_output_tokens,
        },
      };
    },

    getMessages: async ({ projectId }) => {
      requireProject(projects, projectId);
      return { messages: chatMessages.getMessages(projectId) };
    },

    getSessionHistory: async ({ projectId, limit }) => {
      requireProject(projects, projectId);
      return { sessions: chatMessages.getRecentSessions(projectId, limit) };
    },

    loadSession: async ({ projectId, chatSessionId }) => {
      requireProject(projects, projectId);
      return {
        messages: chatMessages.getMessagesByChatSession(projectId, chatSessionId),
        chatSessionId,
      };
    },

    getFocusDocumentSession: async (params) => {
      const result = await chatService.getOrCreateFocusDocumentSession(params);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  };
}

export function registerChatHandlers(deps: ChatHandlerDeps): void {
  // `ChatSendSchema` layers the temp-image-directory scoping refine that
  // the shared registry's `params` can't express (see `validation/chat.ts`),
  // so `send` parses through it instead of `chatEndpoints.send.params`.
  createRegistryIpcHandlers(
    chatEndpoints,
    buildChatHandlers(deps),
    'Chat operation failed',
    {
      send: ChatSendSchema,
    }
  );
}
