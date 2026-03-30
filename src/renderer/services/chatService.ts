import type {
  Activity,
  ChatViewMode,
  FocusedResource,
  PlanAction,
} from '../../shared/types';

export interface ChunkEventData {
  projectId: string;
  chatSessionId?: string;
  text: string;
  segmentId?: number;
  precedingActivities?: Activity[];
}

export interface PlanActionsEventData {
  projectId: string;
  chatSessionId?: string;
  actions: PlanAction[];
}

export interface FileUpdateEventData {
  projectId: string;
  chatSessionId?: string;
  filePath: string;
  content: string;
  oldContent?: string | null;
}

export interface SessionEventData {
  projectId: string;
  chatSessionId?: string;
  reason?: string;
  source?: string;
  previousState?: string;
}

export interface ErrorEventData {
  projectId: string;
  chatSessionId?: string;
  error: string;
}

export interface ActivityEventData {
  projectId: string;
  chatSessionId?: string;
  activity: Activity;
}

export interface SessionReadyEventData {
  projectId: string;
  chatSessionId?: string;
  sessionId?: string;
}

export interface ThinkingEventData {
  projectId: string;
  chatSessionId?: string;
  text: string;
}

export interface SuggestionsEventData {
  projectId: string;
  chatSessionId?: string;
  suggestions: string[];
}

export interface McpStatusEventData {
  projectId: string;
  chatSessionId?: string;
  serverName: string;
  status: string;
  error?: string;
}

export function getChatUsage(projectId: string) {
  return window.api.chat.getUsage(projectId);
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
  tempImages?: string[];
  chatSessionId: string;
  currentView?: ChatViewMode;
  clientMessageId: string;
}) {
  return window.api.chat.sendMessage(
    params.projectId,
    params.message,
    params.focusedResources,
    params.tempImages,
    params.chatSessionId,
    params.currentView,
  );
}

export function disconnectChatSession(projectId: string, chatSessionId: string) {
  return window.api.chat.disconnectSpecificSession(projectId, chatSessionId);
}

export function startNewBackendChatSession(projectId: string) {
  return window.api.chat.newSession(projectId);
}

}

export function getChatSessionHistory(projectId: string, limit: number) {
  return window.api.chat.getSessionHistory(projectId, limit);
}

export function loadChatSession(projectId: string, chatSessionId: string) {
  return window.api.chat.loadSession(projectId, chatSessionId);
}

export function subscribeToChatEvents(handlers: {
  onChunk?: (data: ChunkEventData) => void;
  onPlanActions?: (data: PlanActionsEventData) => void;
  onFileUpdate?: (data: FileUpdateEventData) => void;
  onDone?: (data: SessionEventData) => void;
  onError?: (data: ErrorEventData) => void;
  onActivity?: (data: ActivityEventData) => void;
  onThinking?: (data: ThinkingEventData) => void;
  onSessionConnecting?: (data: SessionEventData) => void;
  onSessionReady?: (data: SessionReadyEventData) => void;
  onSessionError?: (data: ErrorEventData) => void;
  onSessionDeactivated?: (data: SessionEventData) => void;
  onSuggestions?: (data: SuggestionsEventData) => void;
  onMcpStatus?: (data: McpStatusEventData) => void;
}): () => void {
  const cleanups = [
    handlers.onChunk ? window.api.chat.onChunk(handlers.onChunk) : null,
    handlers.onPlanActions ? window.api.chat.onPlanActions(handlers.onPlanActions) : null,
    handlers.onFileUpdate ? window.api.chat.onFileUpdate(handlers.onFileUpdate) : null,
    handlers.onDone ? window.api.chat.onDone(handlers.onDone) : null,
    handlers.onError ? window.api.chat.onError(handlers.onError) : null,
    handlers.onActivity ? window.api.chat.onActivity(handlers.onActivity) : null,
    handlers.onThinking ? window.api.chat.onThinking(handlers.onThinking) : null,
    handlers.onSessionConnecting ? window.api.chat.onSessionConnecting(handlers.onSessionConnecting) : null,
    handlers.onSessionReady ? window.api.chat.onSessionReady(handlers.onSessionReady) : null,
    handlers.onSessionError ? window.api.chat.onSessionError(handlers.onSessionError) : null,
    handlers.onSessionDeactivated ? window.api.chat.onSessionDeactivated(handlers.onSessionDeactivated) : null,
    handlers.onSuggestions ? window.api.chat.onSuggestions(handlers.onSuggestions) : null,
    handlers.onMcpStatus ? window.api.chat.onMcpStatus(handlers.onMcpStatus) : null,
  ].filter((cleanup): cleanup is (() => void) => Boolean(cleanup));

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}
