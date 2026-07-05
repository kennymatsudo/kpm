import type {
  ChatEffortLevel,
  ChatProvider,
  ChatViewMode,
  ClaudeModel,
  FocusChatDocument,
  FocusedResource,
} from '../../shared/types';

import type {
  ChunkEventData,
  PlanActionsEventData,
  FileUpdateEventData,
  FileDeleteEventData,
  SessionEventData,
  QueuedEventData,
  QueueClearedEventData,
  ErrorEventData,
  ActivityEventData,
  SessionReadyEventData,
  SessionTitleEventData,
  ThinkingEventData,
  SuggestionsEventData,
  SlashCommandsEventData,
  McpStatusEventData,
} from '../../shared/ipc/chatEvents';

export type {
  ChunkEventData,
  PlanActionsEventData,
  FileUpdateEventData,
  FileDeleteEventData,
  SessionEventData,
  QueuedEventData,
  QueueClearedEventData,
  ErrorEventData,
  ActivityEventData,
  SessionReadyEventData,
  SessionTitleEventData,
  ThinkingEventData,
  SuggestionsEventData,
  SlashCommandsEventData,
  McpStatusEventData,
};

export function getChatUsage(projectId: string) {
  return window.api.chat.getUsage(projectId);
}

export function getSlashCommands() {
  return window.api.chat.getSlashCommands();
}

export function getActiveChatSessions(projectId: string) {
  return window.api.chat.getActiveSessions(projectId);
}

export function getChatSessionState(projectId: string, chatSessionId: string) {
  return window.api.chat.getSessionState(projectId, chatSessionId);
}

export function sendChatMessage(params: {
  projectId: string;
  message: string;
  focusedResources: FocusedResource[];
  model: string;
  provider?: ChatProvider;
  effort?: ChatEffortLevel;
  tempImages?: string[];
  chatSessionId: string;
  currentView?: ChatViewMode;
  clientMessageId: string;
  focusDocument?: FocusChatDocument;
}) {
  return window.api.chat.sendMessage({
    projectId: params.projectId,
    message: params.message,
    focusedResources: params.focusedResources,
    model: params.model as ClaudeModel,
    tempImages: params.tempImages,
    chatSessionId: params.chatSessionId,
    currentView: params.currentView,
    clientMessageId: params.clientMessageId,
    effort: params.effort,
    focusDocument: params.focusDocument,
    provider: params.provider,
  });
}

export function disconnectChatSession(projectId: string, chatSessionId: string) {
  return window.api.chat.disconnectSpecificSession({ projectId, chatSessionId });
}

export function startNewBackendChatSession(projectId: string) {
  return window.api.chat.newSession({ projectId });
}

export function cancelChatSession(projectId: string, chatSessionId: string) {
  return window.api.chat.cancel({ projectId, chatSessionId });
}

export function cancelQueuedChatMessage(projectId: string, chatSessionId: string, clientMessageId?: string) {
  return window.api.chat.cancelQueued({ projectId, chatSessionId, clientMessageId });
}

export function getChatSessionHistory(projectId: string, limit: number) {
  return window.api.chat.getSessionHistory(projectId, limit);
}

export function loadChatSession(projectId: string, chatSessionId: string) {
  return window.api.chat.loadSession(projectId, chatSessionId);
}

export function getFocusDocumentChatSession(
  projectId: string,
  path: string,
  title: string,
  contentHash: string,
) {
  return window.api.chat.getFocusDocumentSession(projectId, path, title, contentHash);
}

export function subscribeToChatEvents(handlers: {
  onChunk?: (data: ChunkEventData) => void;
  onPlanActions?: (data: PlanActionsEventData) => void;
  onFileUpdate?: (data: FileUpdateEventData) => void;
  onFileDelete?: (data: FileDeleteEventData) => void;
  onDone?: (data: SessionEventData) => void;
  onError?: (data: ErrorEventData) => void;
  onActivity?: (data: ActivityEventData) => void;
  onThinking?: (data: ThinkingEventData) => void;
  onSessionConnecting?: (data: SessionEventData) => void;
  onSessionReady?: (data: SessionReadyEventData) => void;
  onSessionTitle?: (data: SessionTitleEventData) => void;
  onSessionError?: (data: ErrorEventData) => void;
  onSessionDeactivated?: (data: SessionEventData) => void;
  onSuggestions?: (data: SuggestionsEventData) => void;
  onSlashCommands?: (data: SlashCommandsEventData) => void;
  onMcpStatus?: (data: McpStatusEventData) => void;
  onQueued?: (data: QueuedEventData) => void;
  onQueueCleared?: (data: QueueClearedEventData) => void;
}): () => void {
  const cleanups = [
    handlers.onChunk ? window.api.chat.onChunk(handlers.onChunk) : null,
    handlers.onPlanActions ? window.api.chat.onPlanActions(handlers.onPlanActions) : null,
    handlers.onFileUpdate ? window.api.chat.onFileUpdate(handlers.onFileUpdate) : null,
    handlers.onFileDelete ? window.api.chat.onFileDelete(handlers.onFileDelete) : null,
    handlers.onDone ? window.api.chat.onDone(handlers.onDone) : null,
    handlers.onError ? window.api.chat.onError(handlers.onError) : null,
    handlers.onActivity ? window.api.chat.onActivity(handlers.onActivity) : null,
    handlers.onThinking ? window.api.chat.onThinking(handlers.onThinking) : null,
    handlers.onSessionConnecting ? window.api.chat.onSessionConnecting(handlers.onSessionConnecting) : null,
    handlers.onSessionReady ? window.api.chat.onSessionReady(handlers.onSessionReady) : null,
    handlers.onSessionTitle ? window.api.chat.onSessionTitle(handlers.onSessionTitle) : null,
    handlers.onSessionError ? window.api.chat.onSessionError(handlers.onSessionError) : null,
    handlers.onSessionDeactivated ? window.api.chat.onSessionDeactivated(handlers.onSessionDeactivated) : null,
    handlers.onSuggestions ? window.api.chat.onSuggestions(handlers.onSuggestions) : null,
    handlers.onSlashCommands ? window.api.chat.onSlashCommands(handlers.onSlashCommands) : null,
    handlers.onMcpStatus ? window.api.chat.onMcpStatus(handlers.onMcpStatus) : null,
    handlers.onQueued ? window.api.chat.onQueued(handlers.onQueued) : null,
    handlers.onQueueCleared ? window.api.chat.onQueueCleared(handlers.onQueueCleared) : null,
  ].filter((cleanup): cleanup is (() => void) => Boolean(cleanup));

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}
