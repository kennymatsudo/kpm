/**
 * Chat domain event registry (main -> renderer push events).
 *
 * Covers the ~20 streaming/progress channels (`chat:chunk`, `chat:done`,
 * etc.) emitted from `StreamingSessionService`/`ChatRuntimeService`. These
 * are not invoke endpoints — see `chatEndpoints.ts` for the invoke surface.
 *
 * Payload interfaces here were previously declared independently in
 * `src/renderer/services/chatService.ts` (`ChunkEventData`, etc.) and in
 * `src/preload/api.ts`'s inline `onX` callback types. This registry is now
 * their single owner; `chatService.ts` re-exports the same names so existing
 * importers don't need to change.
 */

import { payloadOf, type EventDefinition } from './appEvents';
import type { Activity, PlanAction, SlashCommandInfo } from '../types';

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
  forceReview?: boolean;
}

export interface FileMoveEventData {
  projectId: string;
  chatSessionId?: string;
  sourcePath: string;
  targetPath: string;
}

export interface FileDeleteEventData {
  projectId: string;
  chatSessionId?: string;
  path: string;
  isDirectory: boolean;
}

export interface SessionEventData {
  projectId: string;
  chatSessionId?: string;
  reason?: string;
  source?: string;
  previousState?: string;
  model?: string;
  /** True when the SDK is about to pull a queued follow-up as the next turn. */
  hasQueuedFollowUp?: boolean;
  /** clientMessageId of the queued user message about to be promoted. */
  queuedClientMessageId?: string;
  /** clientMessageId before which the finalized assistant bubble should be inserted. */
  beforeClientMessageId?: string;
  /**
   * clientMessageId of a follow-up the SDK absorbed into THIS turn rather than
   * deferring to a new one (streaming-input steering). The renderer clears its
   * optimistic "queued" badge without re-entering streaming — the message was
   * already answered in this turn.
   */
  consumedQueuedClientMessageId?: string;
  /** Total input tokens sent in this turn (includes conversation history). */
  inputTokens?: number;
  /** Output tokens produced in this turn. */
  outputTokens?: number;
  /** Tokens read from prompt cache. */
  cacheReadTokens?: number;
  /** Tokens written to prompt cache. */
  cacheCreationTokens?: number;
  /** Context window size for the model used in this turn (tokens). */
  contextWindow?: number;
}

export interface QueuedEventData {
  projectId: string;
  chatSessionId?: string;
  clientMessageId?: string;
}

export interface QueueClearedEventData {
  projectId: string;
  chatSessionId?: string;
  clientMessageId?: string;
  reason?: 'cancelled' | 'already_sent' | 'session_disconnected';
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
  /**
   * Emitted by `StreamingSessionService` (sourced from the SDK's
   * `McpServerStatus[]`, a main-only type not re-declared here) but not read
   * by any current preload subscriber type or renderer handler
   * (`useChatIpcBridge.onSessionReady` only destructures
   * `projectId`/`chatSessionId`/`sessionId`) — pre-existing drift predating
   * this migration, kept structurally here since it reflects what main
   * actually sends.
   */
  mcpStatus?: { name: string; status: string }[];
}

export interface SessionTitleEventData {
  projectId: string;
  chatSessionId?: string;
  title: string;
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

export interface SlashCommandsEventData {
  projectId: string;
  chatSessionId?: string;
  commands: SlashCommandInfo[];
}

export interface McpStatusEventData {
  projectId: string;
  chatSessionId?: string;
  serverName: string;
  status: string;
  error?: string;
}

export const chatEvents = {
  chunk: { channel: 'chat:chunk', payload: payloadOf<ChunkEventData>() },
  planActions: { channel: 'chat:plan-actions', payload: payloadOf<PlanActionsEventData>() },
  done: { channel: 'chat:done', payload: payloadOf<SessionEventData>() },
  queued: { channel: 'chat:queued', payload: payloadOf<QueuedEventData>() },
  queueCleared: { channel: 'chat:queue-cleared', payload: payloadOf<QueueClearedEventData>() },
  error: { channel: 'chat:error', payload: payloadOf<ErrorEventData>() },
  activity: { channel: 'chat:activity', payload: payloadOf<ActivityEventData>() },
  thinking: { channel: 'chat:thinking', payload: payloadOf<ThinkingEventData>() },
  fileUpdate: { channel: 'chat:file-update', payload: payloadOf<FileUpdateEventData>() },
  fileMove: { channel: 'chat:file-move', payload: payloadOf<FileMoveEventData>() },
  fileDelete: { channel: 'chat:file-delete', payload: payloadOf<FileDeleteEventData>() },
  sessionConnecting: { channel: 'chat:session-connecting', payload: payloadOf<SessionEventData>() },
  sessionReady: { channel: 'chat:session-ready', payload: payloadOf<SessionReadyEventData>() },
  sessionTitle: { channel: 'chat:session-title', payload: payloadOf<SessionTitleEventData>() },
  sessionError: { channel: 'chat:session-error', payload: payloadOf<ErrorEventData>() },
  suggestions: { channel: 'chat:suggestions', payload: payloadOf<SuggestionsEventData>() },
  slashCommands: { channel: 'chat:slash-commands', payload: payloadOf<SlashCommandsEventData>() },
  sessionDeactivated: { channel: 'chat:session-deactivated', payload: payloadOf<SessionEventData>() },
  mcpStatus: { channel: 'chat:mcp-status', payload: payloadOf<McpStatusEventData>() },
  /**
   * Emitted when a turn's response was truncated by hitting the max_tokens
   * limit. No preload subscriber exists today — kept wired per the
   * migration's "don't silently delete a dead event" rule.
   */
  truncated: { channel: 'chat:truncated', payload: payloadOf<{ projectId: string; chatSessionId: string; reason: 'max_tokens' }>() },
  /**
   * Emitted when the permission handler intercepts a project context-file
   * edit, for diff display. No preload subscriber exists today — kept wired
   * per the migration's "don't silently delete a dead event" rule.
   */
  contextFileUpdate: { channel: 'chat:context-file-update', payload: payloadOf<{ projectId: string; oldContent: string | null; newContent: string; forceReview: boolean }>() },
} satisfies Record<string, EventDefinition>;

export type ChatEvents = typeof chatEvents;
export type ChatEventName = keyof ChatEvents;
