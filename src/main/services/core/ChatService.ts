import { randomUUID } from 'crypto';
import {
  clearSessionCache as clearPermissionSessionCache,
} from '../../claude/permissions';
import type {
  ChatMessage,
  ChatSessionSummary,
  ChatViewMode,
  ClaudeModel,
  FocusedResource,
  SessionState,
} from '../../../shared/types';
import { failure, success, type AsyncResult, type ServiceResult } from '../result';
import type { StreamingSessionService } from '../streaming/StreamingSessionService';

export interface ChatServiceDeps {
  projects: IProjectRepository;
  chatMessages: IChatMessageRepository;
  loadPersistedPermissions: (projectId: string) => void;
  clearSessionCache?: (projectId: string) => void;
  streamingSessionService: Pick<
    StreamingSessionService,
    | 'sendChatMessage'
    | 'interruptChatSession'
    | 'disconnectChatSession'
    | 'getActiveSessions'
    | 'getChatSessionState'
  >;
  emitChatError?: (payload: { projectId: string; chatSessionId?: string; error: string }) => void;
}

export interface SendChatMessageInput {
  projectId: string;
  message: string;
  model?: ClaudeModel;
  tempImages?: string[];
  chatSessionId?: string;
  clientMessageId?: string;
}

  }

}

export function createChatService(deps: ChatServiceDeps) {
  const clearSessionCache = deps.clearSessionCache ?? clearPermissionSessionCache;

  function emitError(projectId: string, chatSessionId: string | undefined, error: string): void {
    deps.emitChatError?.({ projectId, chatSessionId, error });
  }

  return {
      const {
        projectId,
        message,
        model,
        tempImages,
        chatSessionId,
        clientMessageId,
      } = input;

      try {
        const project = deps.projects.get(projectId);
        if (!project) {
          emitError(projectId, chatSessionId, 'Project not found');
          return failure('Project not found');
        }

        const result = await deps.streamingSessionService.sendChatMessage(
          projectId,
          {
          }
        );

        if (!result.ok) {
          emitError(projectId, chatSessionId, result.error);
          return failure(result.error);
        }

        return success(undefined);
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'Unknown error';
        emitError(projectId, chatSessionId, messageText);
        return failure(messageText);
      }
    },

      const result = await deps.streamingSessionService.interruptChatSession(projectId, chatSessionId);
      return result.ok ? success(undefined) : failure(result.error);
    },

    newSession(projectId: string): ServiceResult<void> {
      try {
        deps.projects.resetTokens(projectId);
        deps.chatMessages.pruneOldSessions(projectId, 10);
        clearSessionCache(projectId);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    connectSession(projectId: string): ServiceResult<void> {
      try {
        deps.loadPersistedPermissions(projectId);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    async disconnectSession(projectId: string): AsyncResult<void> {
      const result = await deps.streamingSessionService.disconnectChatSession(projectId);
      if (!result.ok) {
        return failure(result.error);
      }

      clearSessionCache(projectId);
      return success(undefined);
    },

    getActiveSessions(projectId: string): ServiceResult<ReturnType<StreamingSessionService['getActiveSessions']>> {
      try {
        return success(deps.streamingSessionService.getActiveSessions(projectId));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    async disconnectSpecificSession(projectId: string, chatSessionId: string): AsyncResult<void> {
      const result = await deps.streamingSessionService.disconnectChatSession(projectId, chatSessionId);
      return result.ok ? success(undefined) : failure(result.error);
    },

    getSessionState(projectId: string, chatSessionId: string): ServiceResult<SessionState> {
      try {
        return success(deps.streamingSessionService.getChatSessionState(projectId, chatSessionId));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    getUsage(projectId: string): ServiceResult<{
      totalTokens: number;
      inputTokens: number;
      outputTokens: number;
    }> {
      try {
        const project = deps.projects.get(projectId);
        if (!project) {
          return success({ totalTokens: 0, inputTokens: 0, outputTokens: 0 });
        }

        return success({
          totalTokens: project.session_tokens,
          inputTokens: project.session_input_tokens,
          outputTokens: project.session_output_tokens,
        });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    getMessages(projectId: string): ServiceResult<ChatMessage[]> {
      try {
        const project = deps.projects.get(projectId);
        if (!project) {
          return failure('Project not found');
        }
        return success(deps.chatMessages.getMessages(projectId));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    getSessionHistory(projectId: string, limit?: number): ServiceResult<ChatSessionSummary[]> {
      try {
        const project = deps.projects.get(projectId);
        if (!project) {
          return failure('Project not found');
        }
        return success(deps.chatMessages.getRecentSessions(projectId, limit));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    loadSession(
      projectId: string,
      chatSessionId: string,
      try {
        const project = deps.projects.get(projectId);
        if (!project) {
          return failure('Project not found');
        }

        const messages = deps.chatMessages.getMessagesByChatSession(projectId, chatSessionId);
        return success({
          messages,
          chatSessionId,
        });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export type ChatService = ReturnType<typeof createChatService>;
