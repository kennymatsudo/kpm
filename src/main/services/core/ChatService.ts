import { randomUUID } from 'crypto';
import type { IChatMessageRepository, IChatSessionRepository, IProjectRepository, IRepoRepository } from '../../db/interfaces';
import type {
  ChatAttachment,
  ChatChoiceView,
  ChatMessage,
  ChatProvider,
  ChatViewMode,
  FocusChatDocument,
  FocusedResource,
} from '../../../shared/types';
import { failure, success, wrap, type AsyncResult, type ServiceResult } from '../result';
import type { StreamingSessionService } from '../streaming/StreamingSessionService';
import type { SlashCommandService } from './SlashCommandService';
import type { ChatModelChoiceService } from '../../chat/modelChoice';
import { resolveEffectiveRepoPath } from '../../../shared/repoPath';
import { unsupportedAttachmentError } from '../../../shared/providerCapabilities';

export interface ChatServiceDeps {
  projects: IProjectRepository;
  repos: Pick<IRepoRepository, 'getByProject'>;
  chatMessages: IChatMessageRepository;
  chatSessions: IChatSessionRepository;
  modelChoice: ChatModelChoiceService;
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
  choice: ChatChoiceView;
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
  function emitError(projectId: string, chatSessionId: string | undefined, error: string): void {
    deps.emitChatError?.({ projectId, chatSessionId, error });
  }

  function persistAcceptedUserMessage(
    projectId: string,
    message: string,
    attachments: ChatAttachment[],
    chatSessionId: string | undefined,
    clientMessageId: string | undefined,
    provider: ChatProvider,
  ): void {
    try {
      // Attachments are not persisted, so an attachment-only message is
      // stored as the file names; otherwise history would show an empty bubble.
      // Display only: providers resume from their own transcripts.
      const displayText = message.trim() || `Attached ${attachments.map((a) => a.filename).join(', ')}`;
      deps.chatMessages.addMessage(
        projectId,
        'user',
        displayText,
        chatSessionId,
        clientMessageId,
        provider,
      );
    } catch (error) {
      console.error('[ChatService] Failed to persist accepted user message:', error);
    }
  }

  function resolveFocusedResources(
    projectId: string,
    focusedResources: FocusedResource[],
  ): FocusedResource[] {
    const reposById = new Map(deps.repos.getByProject(projectId).map((repo) => [repo.id, repo]));
    return focusedResources.map((resource) => {
      if (resource.type !== 'repo') return resource;
      const repo = reposById.get(resource.id);
      return repo
        ? { type: 'repo', id: resource.id, path: resolveEffectiveRepoPath(repo) }
        : { type: 'repo', id: resource.id };
    });
  }

  return {
    async sendMessage(
      input: SendChatMessageInput,
      promptContext?: ChatPromptContext,
    ): AsyncResult<void> {
      const {
        projectId,
        message,
        attachments = [],
        chatSessionId,
        clientMessageId,
      } = input;
      try {
        const project = deps.projects.get(projectId);
        if (!project) {
          emitError(projectId, chatSessionId, 'Project not found');
          return failure('Project not found');
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
        if (clientMessageId) {
          const owningChatSessionIds = deps.chatMessages.getChatSessionIdsByClientMessageId(
            projectId,
            clientMessageId,
          );
          if (owningChatSessionIds.some((sessionId) => sessionId !== chatSessionId)) {
            const errorText = 'This message belongs to another chat session.';
            emitError(projectId, chatSessionId, errorText);
            return failure(errorText);
          }
        }
        const resolvedChoice = await deps.modelChoice.resolveForTurn(projectId, chatSessionId);
        if (!resolvedChoice.ok) {
          emitError(projectId, chatSessionId, resolvedChoice.error);
          return failure(resolvedChoice.error);
        }
        const unsupported = unsupportedAttachmentError(resolvedChoice.data.provider, attachments);
        if (unsupported) {
          emitError(projectId, chatSessionId, unsupported);
          return failure(unsupported);
        }

        const result = await deps.streamingSessionService.sendChatMessage(
          projectId,
          messageForModel,
          {
            choice: resolvedChoice.data,
            focusedResources: resolveFocusedResources(projectId, promptContext?.focusedResources ?? []),
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
          attachments,
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
      });
    },

    async disconnectSession(projectId: string): AsyncResult<void> {
      const result = await deps.streamingSessionService.disconnectChatSession(projectId);
      if (!result.ok) {
        return failure(result.error);
      }

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

        const openedChoice = await deps.modelChoice.open({
          projectId,
          chatSessionId: chatSession.id,
          scope: 'focus_document',
          focusDocument: {
            path: documentPath,
            title: trimmedTitle,
            contentHash,
          },
        });
        if (!openedChoice.ok) return failure(openedChoice.error);

        const messages = deps.chatMessages.getMessagesByChatSession(projectId, chatSession.id);
        return success({
          chatSessionId: chatSession.id,
          messages,
          choice: openedChoice.data,
        });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export type ChatService = ReturnType<typeof createChatService>;
