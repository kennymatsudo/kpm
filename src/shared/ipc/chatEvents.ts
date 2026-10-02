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
import type { Activity, AgentBackgroundTask, PlanAction, SlashCommandInfo } from '../types';
import type { ModelCatalog } from '../modelCatalog';
import type { ConfigChange } from '../configKinds';
import type { BoardChange } from '../boardChanges';

export interface ChunkEventData {
  projectId: string;
  chatSessionId?: string;
  text: string;
  segmentId?: number;
  precedingActivities?: Activity[];
}

/** The project and chat a proposal came from. */
interface ProposalScope {
  projectId: string;
  chatSessionId?: string;
}

export interface FileUpdateEventData extends ProposalScope {
  filePath: string;
  content: string;
  oldContent?: string | null;
  forceReview?: boolean;
}

/**
 * One change a chat turn proposes, bound for the approval queue. Every kind
 * follows the user's review setting except `config-change`, which always
 * queues for review (P8), and a file update with `forceReview`.
 */
export type ChatProposalEventData =
  | (ProposalScope & { kind: 'plan-actions'; actions: PlanAction[] })
  | ({ kind: 'file-update' } & FileUpdateEventData)
  | (ProposalScope & { kind: 'file-move'; sourcePath: string; targetPath: string })
  | (ProposalScope & { kind: 'file-delete'; path: string; isDirectory: boolean })
  | (ProposalScope & { kind: 'config-change'; change: ConfigChange })
  | (ProposalScope & { kind: 'board-change'; change: BoardChange });

/** Payload for `chat:done` — a turn's result fields, no lifecycle metadata. */
export interface TurnDoneEventData {
  projectId: string;
  chatSessionId?: string;
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

/** Payload for `sessionConnecting`/`sessionDeactivated` — session lifecycle metadata, no turn-result fields. */
export interface SessionLifecycleEventData {
  projectId: string;
  chatSessionId?: string;
  reason?: string;
  source?: string;
  previousState?: string;
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

/**
 * The complete set of a session's live background tasks. Replace semantics:
 * subscribers swap their set for `tasks`, so an empty array means all
 * background work has finished.
 */
export interface BackgroundTasksEventData {
  projectId: string;
  chatSessionId?: string;
  tasks: AgentBackgroundTask[];
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
  proposal: { channel: 'chat:proposal', payload: payloadOf<ChatProposalEventData>() },
  done: { channel: 'chat:done', payload: payloadOf<TurnDoneEventData>() },
  queueCleared: { channel: 'chat:queue-cleared', payload: payloadOf<QueueClearedEventData>() },
  error: { channel: 'chat:error', payload: payloadOf<ErrorEventData>() },
  activity: { channel: 'chat:activity', payload: payloadOf<ActivityEventData>() },
  thinking: { channel: 'chat:thinking', payload: payloadOf<ThinkingEventData>() },
  backgroundTasks: { channel: 'chat:background-tasks', payload: payloadOf<BackgroundTasksEventData>() },
  sessionConnecting: { channel: 'chat:session-connecting', payload: payloadOf<SessionLifecycleEventData>() },
  sessionReady: { channel: 'chat:session-ready', payload: payloadOf<SessionReadyEventData>() },
  sessionTitle: { channel: 'chat:session-title', payload: payloadOf<SessionTitleEventData>() },
  sessionError: { channel: 'chat:session-error', payload: payloadOf<ErrorEventData>() },
  suggestions: { channel: 'chat:suggestions', payload: payloadOf<SuggestionsEventData>() },
  slashCommands: { channel: 'chat:slash-commands', payload: payloadOf<SlashCommandsEventData>() },
  sessionDeactivated: { channel: 'chat:session-deactivated', payload: payloadOf<SessionLifecycleEventData>() },
  mcpStatus: { channel: 'chat:mcp-status', payload: payloadOf<McpStatusEventData>() },
  /** Claude's or Codex's model list changed after the launch-time refresh. */
  modelCatalog: { channel: 'chat:model-catalog', payload: payloadOf<ModelCatalog>() },
} satisfies Record<string, EventDefinition>;

export type ChatEvents = typeof chatEvents;
export type ChatEventName = keyof ChatEvents;
