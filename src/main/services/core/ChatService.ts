import { randomUUID } from 'crypto';
import * as path from 'path';
import {
  clearSessionCache as clearPermissionSessionCache,
} from '../../claude/permissions';
import type { IChatMessageRepository, IChatSessionRepository, IProjectRepository } from '../../db/interfaces';
import type {
  ChatAttachment,
  ChatChoiceView,
  ChatMessage,
  ChatProvider,
  ChatViewMode,
  ClaudeModel,
  FocusChatDocument,
  FocusedResource,
} from '../../../shared/types';
import { failure, success, wrap, type AsyncResult, type ServiceResult } from '../result';
import type { StreamingSessionService } from '../streaming/StreamingSessionService';
import type { SlashCommandService } from './SlashCommandService';
import type { ChatModelChoiceService } from '../../chat/modelChoice';

export interface ChatServiceDeps {
  projects: IProjectRepository;
  chatMessages: IChatMessageRepository;
  chatSessions: IChatSessionRepository;
  modelChoice?: ChatModelChoiceService;
  getDefaultChatProvider?: () => ChatProvider;
  clearSessionCache?: (projectId: string) => void;
  streamingSessionService: Pick<
    StreamingSessionService,
    'sendChatMessage' | 'disconnectChatSession'
  >;
  slashCommandService?: Pick<SlashCommandService, 'expandPiPromptInvocation'>;
  emitChatError?: (payload: { projectId: string; chatSessionId?: string; error: string }) => void;
}

export interface SendChatMessageInput {
  projectId: string;
  message: string;
  /** @deprecated Ignored when the authoritative model-choice module is configured. */
  provider?: ChatProvider;
  /** @deprecated Ignored when the authoritative model-choice module is configured. */
  model?: ClaudeModel;
  /** @deprecated Ignored when the authoritative model-choice module is configured. */
  providerModel?: string;
  /** @deprecated Ignored when the authoritative model-choice module is configured. */
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
  focusDocument?: FocusChatDocument;
}

export interface FocusDocumentSessionInput {
  projectId: string;
  path: string;
  title: string;
  contentHash: string;
}

export interface FocusDocumentSessionResult {
  chatSessionId: string;
  messages: ChatMessage[];
  choice?: ChatChoiceView;
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

/**
 * The chat behaviours that don't belong on the streaming service or a
 * repository: message-send orchestration (attachment conversion, acceptance
 * persistence, error events), project chat reset, project-wide disconnect
 * with permission-cache teardown, and focus-document session reconciliation.
 *
 * Plain session reads (messages, history, usage, active sessions, session
 * state) go straight from the IPC handlers to the repositories /
 * StreamingSessionService — do not add forwarding methods for them here.
 */
export function createChatService(deps: ChatServiceDeps) {
  const clearSessionCache = deps.clearSessionCache ?? clearPermissionSessionCache;

  function emitError(projectId: string, chatSessionId: string | undefined, error: string): void {
    deps.emitChatError?.({ projectId, chatSessionId, error });
  }

  function persistAcceptedUserMessage(
    projectId: string,
    message: string,
    chatSessionId: string | undefined,
    clientMessageId: string | undefined,
    provider: ChatProvider,
  ): void {
    try {
      // Persist the plain user text — no attachment prefix. Attachment
      // metadata persistence lands in Phase 3.
      deps.chatMessages.addMessage(
        projectId,
        'user',
        message,
        chatSessionId,
        clientMessageId,
        provider,
      );
    } catch (error) {
      console.error('[ChatService] Failed to persist accepted user message:', error);
    }
  }

  return {
    async sendMessage(
      input: SendChatMessageInput,
      promptContext?: ChatPromptContext,
    ): AsyncResult<void> {
      const {
        projectId,
        message,
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

        const expansion = deps.slashCommandService?.expandPiPromptInvocation(message, {
          projectFolderPath: project.folder_path,
        });
        if (expansion && !expansion.ok) {
          emitError(projectId, chatSessionId, expansion.error);
          return failure(expansion.error);
        }
        const messageForModel = expansion?.data ?? message;

        if (!chatSessionId) {
          emitError(projectId, chatSessionId, 'chatSessionId is required');
          return failure('chatSessionId is required');
        }
        const resolvedChoice = deps.modelChoice
          ? await deps.modelChoice.resolveForTurn(projectId, chatSessionId)
          : success({
              provider: input.provider ?? deps.getDefaultChatProvider?.() ?? 'claude',
              model: input.providerModel ?? input.model ?? 'sonnet',
              effort: input.effort ?? null,
              revision: 0,
            });
        if (!resolvedChoice.ok) {
          emitError(projectId, chatSessionId, resolvedChoice.error);
          return failure(resolvedChoice.error);
        }

        const result = await deps.streamingSessionService.sendChatMessage(
          projectId,
          messageForModel,
          {
            authoritativeChoice: resolvedChoice.data,
            ...(!deps.modelChoice ? {
              provider: resolvedChoice.data.provider,
              model: input.model,
              providerModel: input.providerModel,
              effort: input.effort,
            } : {}),
            focusedResources: promptContext?.focusedResources ?? [],
            chatSessionId,
            currentView: promptContext?.currentView,
            focusDocument: promptContext?.focusDocument,
            attachments: attachments.length > 0 ? attachments : undefined,
            clientMessageId,
            persistHistory: true,
          }
        );

        if (!result.ok) {
          emitError(projectId, chatSessionId, result.error);
          return failure(result.error);
        }

        persistAcceptedUserMessage(
          projectId,
          message,
          chatSessionId,
          clientMessageId,
          resolvedChoice.data.provider,
        );
        return success(undefined);
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'Unknown error';
        emitError(projectId, chatSessionId, messageText);
        return failure(messageText);
      }
    },

    newSession(projectId: string): ServiceResult<void> {
      return wrap(() => {
        deps.projects.resetTokens(projectId);
        deps.chatMessages.pruneOldSessions(projectId, 10);
        clearSessionCache(projectId);
      });
    },

    async disconnectSession(projectId: string): AsyncResult<void> {
      const result = await deps.streamingSessionService.disconnectChatSession(projectId);
      if (!result.ok) {
        return failure(result.error);
      }

      clearSessionCache(projectId);
      return success(undefined);
    },

    async getOrCreateFocusDocumentSession(
      input: FocusDocumentSessionInput,
    ): AsyncResult<FocusDocumentSessionResult> {
      const { projectId, path: documentPath, title, contentHash } = input;

      try {
        const project = deps.projects.get(projectId);
        if (!project) {
          return failure('Project not found');
        }

        const trimmedTitle = title.trim() || documentPath;
        const existing = deps.chatSessions.getFocusDocument(projectId, documentPath);
        let chatSession = existing;

        if (chatSession) {
          const contentChanged = chatSession.focus_document_hash !== contentHash;
          if (contentChanged) {
            const disconnectResult = await deps.streamingSessionService.disconnectChatSession(
              projectId,
              chatSession.id,
            );
            if (!disconnectResult.ok) {
              return failure(disconnectResult.error);
            }
          }
          chatSession = deps.chatSessions.updateFocusDocument(
            chatSession.id,
            trimmedTitle,
            contentHash,
            contentChanged,
          );
        } else {
          chatSession = deps.chatSessions.createFocusDocument(
            randomUUID(),
            projectId,
            documentPath,
            trimmedTitle,
            contentHash,
          );
        }

        const openedChoice = deps.modelChoice ? await deps.modelChoice.open({
          projectId,
          chatSessionId: chatSession.id,
          scope: 'focus_document',
          focusDocument: {
            path: documentPath,
            title: trimmedTitle,
            contentHash,
          },
        }) : null;
        if (openedChoice && !openedChoice.ok) return failure(openedChoice.error);

        const messages = deps.chatMessages.getMessagesByChatSession(projectId, chatSession.id);
        return success({
          chatSessionId: chatSession.id,
          messages,
          ...(openedChoice?.ok ? { choice: openedChoice.data } : {}),
        });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export type ChatService = ReturnType<typeof createChatService>;
