import { randomUUID } from 'crypto';
import * as path from 'path';
import {
  clearSessionCache as clearPermissionSessionCache,
} from '../../claude/permissions';
import type {
  ChatAttachment,
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
  effort?: 'low' | 'medium' | 'high' | 'max';
  /**
   * Wire-format list of paste-derived temp image absolute paths. Backward-
   * compatible with the existing IPC boundary; converted to {@link ChatAttachment}
   * before reaching the streaming layer.
   */
  tempImages?: string[];
  /** Pre-built attachment list. Takes precedence when present. */
  attachments?: ChatAttachment[];
  chatSessionId?: string;
  clientMessageId?: string;
}

/**
 * View metadata forwarded to the prompt/streaming layer.
 *
 * ChatService does not inspect these fields — it only forwards them. Keeping
 * them separate from `SendChatMessageInput` makes the service view-agnostic:
 * the UI can restructure its focus/view model without touching chat logic.
 */
export interface ChatPromptContext {
  focusedResources: FocusedResource[];
  currentView?: ChatViewMode;
}

/**
 * Map a paste-derived temp image path to a structured {@link ChatAttachment}.
 *
 * The renderer's paste flow only produces images today (PNG/JPEG/GIF/WebP);
 * BMP is supported by the temp-image cache but the SDK rejects it, so we
 * surface a clear error rather than silently dropping it.
 */
function tempImagePathToAttachment(filePath: string): ChatAttachment {
  const ext = path.extname(filePath).toLowerCase();
  const filename = path.basename(filePath);
  switch (ext) {
    case '.png':
      return { kind: 'image', path: filePath, filename, mediaType: 'image/png' };
    case '.jpg':
    case '.jpeg':
      return { kind: 'image', path: filePath, filename, mediaType: 'image/jpeg' };
    case '.gif':
      return { kind: 'image', path: filePath, filename, mediaType: 'image/gif' };
    case '.webp':
      return { kind: 'image', path: filePath, filename, mediaType: 'image/webp' };
    case '.bmp':
      throw new Error(
        `BMP images aren't supported by the model. Convert "${filename}" to PNG, JPEG, GIF, or WebP and try again.`,
      );
    default:
      throw new Error(`Unsupported attachment type "${ext}" for "${filename}"`);
  }
}

function buildAttachments(
  tempImages: string[] | undefined,
  attachments: ChatAttachment[] | undefined,
): ChatAttachment[] {
  if (attachments && attachments.length > 0) {
    return attachments;
  }
  if (!tempImages || tempImages.length === 0) {
    return [];
  }
  return tempImages.map(tempImagePathToAttachment);
}

export function createChatService(deps: ChatServiceDeps) {
  const clearSessionCache = deps.clearSessionCache ?? clearPermissionSessionCache;

  function emitError(projectId: string, chatSessionId: string | undefined, error: string): void {
    deps.emitChatError?.({ projectId, chatSessionId, error });
  }

  return {
    async sendMessage(
      input: SendChatMessageInput,
      promptContext?: ChatPromptContext,
    ): AsyncResult<void> {
      const {
        projectId,
        message,
        model,
        effort,
        tempImages,
        attachments: providedAttachments,
        chatSessionId,
        clientMessageId,
      } = input;

      try {
        const project = deps.projects.get(projectId);
        if (!project) {
          emitError(projectId, chatSessionId, 'Project not found');
          return failure('Project not found');
        }

        let attachments: ChatAttachment[];
        try {
          attachments = buildAttachments(tempImages, providedAttachments);
        } catch (conversionError) {
          const errorText =
            conversionError instanceof Error ? conversionError.message : 'Unsupported attachment';
          emitError(projectId, chatSessionId, errorText);
          return failure(errorText);
        }

        const result = await deps.streamingSessionService.sendChatMessage(
          projectId,
          {
            model: model ?? 'sonnet',
            effort,
            focusedResources: (promptContext?.focusedResources ?? []) as { type: string; path: string }[],
            chatSessionId,
            currentView: promptContext?.currentView,
            attachments: attachments.length > 0 ? attachments : undefined,
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
