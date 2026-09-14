import type { ChatService } from '../../services/core/ChatService';
import type { SlashCommandService } from '../../services/core/SlashCommandService';
import type { StreamingSessionService } from '../../services/streaming/StreamingSessionService';
import type { IChatMessageRepository, IProjectRepository } from '../../db/interfaces';
import type { ChatModelChoiceService } from '../../chat/modelChoice';
import { chatEndpoints, type ChatEndpointName } from '../../../shared/ipc/chatEndpoints';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';
import { ChatSendSchema } from '../validation/chat';
import { createRegistryIpcHandlers } from '../validation/utils';
import { isPiAvailable } from '../../pi/detect';
import { listPiProviders } from '../../pi/providers';
import { getConfig } from '../../config';
import { withTimeout } from '../../utils/withTimeout';

export interface ChatHandlerDeps {
  chatService: ChatService;
  slashCommandService: SlashCommandService;
  streamingSessionService: Pick<
    StreamingSessionService,
    'interruptChatSession' | 'cancelQueuedChatMessage' | 'disconnectChatSession' | 'getActiveSessions' | 'getChatSessionState'
    | 'getSessionMcpServers' | 'reloadSessionMcpServers' | 'loginSessionMcpServer'
  >;
  projects: IProjectRepository;
  chatMessages: IChatMessageRepository;
  modelChoice: ChatModelChoiceService;
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

function modelChoiceControlsBusy(
  streamingSessionService: ChatHandlerDeps['streamingSessionService'],
  projectId: string,
  chatSessionId: string,
): boolean {
  const state = streamingSessionService.getChatSessionState(projectId, chatSessionId);
  return state === 'processing' || state === 'connecting';
}

function buildChatHandlers(deps: ChatHandlerDeps): ChatHandlers {
  const { chatService, slashCommandService, streamingSessionService, projects, chatMessages, modelChoice } = deps;

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

    openChoice: async (params) => {
      const result = await modelChoice.open({
        ...params,
        responding: modelChoiceControlsBusy(
          streamingSessionService,
          params.projectId,
          params.chatSessionId,
        ),
      });
      if (!result.ok) throw new Error(result.error);
      return { choice: result.data };
    },

    changeChoice: async (params) => {
      const result = await modelChoice.change({
        ...params,
        responding: modelChoiceControlsBusy(
          streamingSessionService,
          params.projectId,
          params.chatSessionId,
        ),
      });
      if (!result.ok) throw new Error(result.error);
      return { choice: result.data };
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

    connectSession: async () => {
      // Nothing to load: the project's write grant is hydrated once at
      // startup and outlives every session, so connecting is a no-op.
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
      const opened = await modelChoice.open({ projectId, chatSessionId, scope: 'main' });
      if (!opened.ok) throw new Error(opened.error);
      return {
        messages: chatMessages.getMessagesByChatSession(projectId, chatSessionId),
        chatSessionId,
        choice: opened.data,
      };
    },

    getFocusDocumentSession: async (params) => {
      const result = await chatService.getOrCreateFocusDocumentSession(params);
      if (!result.ok) throw new Error(result.error);
      if (!result.data.choice) throw new Error('Chat model choice was not hydrated');
      return { ...result.data, choice: result.data.choice };
    },

    piProviders: async () => {
      const available = await isPiAvailable();
      const providers = available
        ? await withTimeout(listPiProviders(), getConfig().session.piCatalogTimeoutMs, [])
        : [];
      return { available, providers };
    },

    mcpServers: async ({ projectId, chatSessionId }) => {
      const result = await streamingSessionService.getSessionMcpServers(projectId, chatSessionId);
      if (!result.ok) throw new Error(result.error);
      return { servers: result.data };
    },

    reloadMcpServers: async ({ projectId, chatSessionId }) => {
      const result = await streamingSessionService.reloadSessionMcpServers(projectId, chatSessionId);
      if (!result.ok) throw new Error(result.error);
    },

    loginMcpServer: async ({ projectId, chatSessionId, serverName }) => {
      const result = await streamingSessionService.loginSessionMcpServer(projectId, chatSessionId, serverName);
      if (!result.ok) throw new Error(result.error);
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
