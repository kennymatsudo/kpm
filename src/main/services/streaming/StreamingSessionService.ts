/**
 * StreamingSessionService - Application service for streaming Claude sessions.
 *
 * This service manages the lifecycle of streaming sessions for main project chat.
 * It follows KPM's DI pattern for testability.
 *
 * Key features:
 * - Connect on project open (zero-latency first message)
 * - Auto-reconnect on timeout or crash
 * - Unified chat session for Plan and Workspace views (shared history)
 * - Multiple concurrent sessions per project (up to MAX_CONCURRENT_SESSIONS)
 *
 * Session keys:
 * - Main chat: `chat:{projectId}:{chatSessionId}` (unique per session)
 */

import type { BrowserWindow } from 'electron';
import type { Options as SDKOptions, OnElicitation } from '@anthropic-ai/claude-agent-sdk';
import { getSessionInfo } from '@anthropic-ai/claude-agent-sdk';
import { StreamingSession, type McpServerStatus } from '../../claude/streaming';
import { CodexChatSession } from '../../codex/CodexChatSession';
import { getToolActivity, extractDiffFromToolResult } from '../../claude/activity';
import type { ClaudeMdUpdatePayload } from '../../claude/tools/claudemd-update';
import type { DocumentUpdatePayload } from '../../claude/tools/document-update';
import type { FileDeletePayload } from '../../claude/tools/file-delete';
import {
  runWithToolExecutionContext,
  clearPendingDocumentContent,
  peekPendingDocumentContent,
  recordPendingDocumentContent,
  type PlanActionsEvent,
} from '../../claude/tools/createKpmServer';
import { buildUserContentBlocks } from '../../claude/attachmentBlocks';
import { buildFocusedSection } from '../../claude/prompts/focusedResources';
import { type ServiceResult, type AsyncResult, success, failure } from '../result';
import type { PlanContext } from '../../claude/prompts';
import type { ChatProvider, FocusChatDocument, FocusedResource, Project, Activity, ToolCallLogEntry, ChatAttachment, ChatSessionScope } from '../../../shared/types';
import { getConfig } from '../../config';
import { clientManager } from '../../claude/clientManager';
import { isMaxTokensReached, isMaxTurnsReached, isApiRetryMessage, isRateLimitEvent, isToolProgressMessage, isInformationalMessage, isPartialAssistantMessage, isCompactBoundaryMessage, isModelRefusalFallbackMessage, isModelRefusalNoFallbackMessage, getTerminalReason, describeAssistantError, describeModelRefusalNoFallback } from '../../claude/sdkTypeGuards';
import { DEFAULT_CONTEXT_FILENAME } from '../../../shared/contextFile';
import { promptUser } from '../core/PermissionPromptService';
import { selectVisibleSlashCommands } from '../core/SlashCommandService';
import type { PollScheduler, PollTickResult } from '../core/PollScheduler';
import { extractFilePaths } from '../toollog/extractFilePaths';
import { randomUUID } from 'crypto';

// =============================================================================
// Types
// =============================================================================

export type SessionState = 'idle' | 'connecting' | 'ready' | 'processing' | 'error' | 'closing';
export type SessionType = 'chat';
export type ModelType = 'opus' | 'sonnet' | 'haiku';
/** UI view mode - passed to prompts for context-aware suggestions */
export type ViewMode = 'plan' | 'workspace' | 'focus';

// Budgets for the history replay seeded into a fresh SDK session after a
// worktree switch. MAX_TURNS caps ping-pong depth; MAX_CHARS (~15k tokens)
// bounds the preface; MAX_TURN_CHARS prevents a single noisy turn from
// eating the whole budget.
const CONTINUATION_MAX_TURNS = 20;
const CONTINUATION_MAX_CHARS = 60_000;
const CONTINUATION_MAX_TURN_CHARS = 8_000;
const CLEANUP_TASK_ID = 'streaming-session-cleanup';

function compactTitleSeed(text: string): string | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.length > 80 ? `${normalized.slice(0, 77).trimEnd()}…` : normalized;
}

function sanitizeSessionTitle(summary: string, fallbackSeed?: string): string | null {
  const normalized = summary.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;

  if (normalized.startsWith('# Focused Selection') || normalized.startsWith('Focused Selection')) {
    return fallbackSeed ? compactTitleSeed(fallbackSeed) : null;
  }

  return normalized;
}

/**
 * Trim stored chat messages into a replay preface for a fresh SDK session.
 * Drops a trailing user turn (the just-sent message persists before we run)
 * and walks backward from the newest prior turn, respecting per-turn and
 * total character caps. Returns messages in chronological order.
 */
export function buildContinuationHistory(
  stored: { role: 'user' | 'assistant'; content: string }[],
): { role: 'user' | 'assistant'; content: string }[] {
  if (stored.length === 0) return [];

  const tail = stored[stored.length - 1];
  const prior = tail?.role === 'user' ? stored.slice(0, -1) : stored;
  if (prior.length === 0) return [];

  const selected: { role: 'user' | 'assistant'; content: string }[] = [];
  let charsUsed = 0;
  for (let i = prior.length - 1; i >= 0; i--) {
    if (selected.length >= CONTINUATION_MAX_TURNS) break;
    const raw = prior[i];
    const trimmed = raw.content.length > CONTINUATION_MAX_TURN_CHARS
      ? `${raw.content.slice(0, CONTINUATION_MAX_TURN_CHARS)}\n\n[…truncated]`
      : raw.content;
    if (charsUsed + trimmed.length > CONTINUATION_MAX_CHARS && selected.length > 0) break;
    selected.push({ role: raw.role, content: trimmed });
    charsUsed += trimmed.length;
  }
  return selected.reverse();
}

// =============================================================================
// Renderer Event Helpers
// =============================================================================
// The result-forwarding code below emits the same few renderer channels from
// many call sites; these give each channel one place that builds its payload
// shape instead of every call site repeating {projectId, chatSessionId, ...}.

function sendChatActivity(
  mainWindow: BrowserWindow | null,
  projectId: string,
  chatSessionId: string | undefined,
  activity: Activity,
): void {
  mainWindow?.webContents.send('chat:activity', { projectId, chatSessionId, activity });
}

function sendChatError(
  mainWindow: BrowserWindow | null,
  projectId: string,
  chatSessionId: string | undefined,
  error: string,
): void {
  mainWindow?.webContents.send('chat:error', { projectId, chatSessionId, error });
}

/** Roll back a session's optimistic 'processing' transition back to 'ready'. */
function resetToReady(managed: Pick<ManagedSession, 'state' | 'processingStartTime' | 'lastSdkActivity'>): void {
  managed.state = 'ready';
  managed.processingStartTime = undefined;
  managed.lastSdkActivity = undefined;
}

function sendQueueCleared(
  mainWindow: BrowserWindow | null,
  projectId: string,
  chatSessionId: string | undefined,
  clientMessageId: string | undefined,
  reason: 'cancelled' | 'already_sent' | 'session_disconnected',
): void {
  mainWindow?.webContents.send('chat:queue-cleared', { projectId, chatSessionId, clientMessageId, reason });
}

/** Guarded sendChatActivity: no-ops while an interrupted turn is being torn down. */
export function sendChatActivityIfActive(
  managed: Pick<ManagedSession, 'interruptInProgress'>,
  mainWindow: BrowserWindow | null,
  projectId: string,
  chatSessionId: string | undefined,
  activity: Activity,
): void {
  if (managed.interruptInProgress) return;
  sendChatActivity(mainWindow, projectId, chatSessionId, activity);
}

/** Guarded chat:thinking send: no-ops while an interrupted turn is being torn down. */
export function sendChatThinkingIfActive(
  managed: Pick<ManagedSession, 'interruptInProgress'>,
  mainWindow: BrowserWindow | null,
  projectId: string,
  chatSessionId: string | undefined,
  text: string,
): void {
  if (managed.interruptInProgress) return;
  mainWindow?.webContents.send('chat:thinking', { projectId, chatSessionId, text });
}

/** Guarded chat:chunk send: no-ops while an interrupted turn is being torn down. */
export function sendChatChunkIfActive(
  managed: Pick<ManagedSession, 'interruptInProgress'>,
  mainWindow: BrowserWindow | null,
  projectId: string,
  chatSessionId: string | undefined,
  text: string,
  segmentId: number,
  precedingActivities: Activity[] | undefined,
): void {
  if (managed.interruptInProgress) return;
  mainWindow?.webContents.send('chat:chunk', { projectId, chatSessionId, text, segmentId, precedingActivities });
}

/**
 * Internal envelope wrapping a user-facing message for transport through the
 * service. Carries the typed text alongside any file attachments that should
 * be turned into native multimodal content blocks at the SDK send site.
 */
interface MessageEnvelope {
  text: string;
  /** Raw user text before per-turn context injection; used for clean session titles. */
  titleSeed?: string;
  attachments?: ChatAttachment[];
}

/** Info about an active session (for UI display) */
export interface ActiveSessionInfo {
  chatSessionId: string;
  scope: ChatSessionScope;
  state: SessionState;
  isProcessing: boolean;
  /** Persisted SDK-derived title (null for legacy rows). */
  title?: string | null;
}

/** Segment state for tracking message boundaries */
interface SegmentState {
  currentSegmentId: number;
  hasTextInCurrentSegment: boolean;
  pendingActivities: Activity[];
}

/** Managed session with metadata */
interface ManagedSession {
  key: string;
  type: SessionType;
  projectId: string;
  session: StreamingSession | CodexChatSession;
  state: SessionState;
  provider: ChatProvider;
  model: ModelType;
  lastActivity: number;
  sessionId?: string; // SDK session ID for resume
  currentView?: ViewMode;
  processingStartTime?: number; // Timestamp when processing started (for timeout detection)
  lastSdkActivity?: number; // Timestamp of most recent SDK message (for idle-while-processing detection)
  mcpHealthStatus: 'healthy' | 'degraded' | 'recovering'; // KPM MCP server health
  mcpRecoveryAttempts: number; // Consecutive failed reconnect attempts
  /** Raw first user message before focused-resource context injection. */
  titleSeed?: string;
  segmentState: SegmentState; // Track message segments for splitting bubbles
  /**
   * Maps SDK tool_use id → the Activity we emitted for it.
   * Used to attach diff stats from the matching tool_use_result back to the
   * original activity (so the renderer updates the existing card instead of
   * pushing a duplicate).
   */
  toolUseActivities: Map<string, Activity>;
  chatSessionId?: string; // For persisting main chat messages
  /** Focus-reader sessions are ephemeral and excluded from normal chat history. */
  persistHistory: boolean;
  /** Document proposals from focus chat always surface for review. */
  forceApprovalReview: boolean;
  accumulatedResponse: string; // Accumulate assistant response for persistence
  lastTurnFinalized: boolean; // True after a turn has emitted chat:done
  suppressLifecycleEventsOnEnd: boolean; // Suppress renderer lifecycle events when session ends
  /**
   * Resolver for interrupt-and-send orchestration: fires when the next
   * 'result' message for the in-flight turn is processed. Used by the
   * session-restart path (view/model change mid-turn) to wait for the
   * aborted turn to finalize before sending on a fresh session.
   */
  pendingInterruptResolver?: () => void;
  /**
   * True while a session-restart-with-message orchestration is in flight
   * (e.g. view changed mid-turn so we must tear down and re-spawn with new
   * system prompt). Suppresses late chunk emission from the aborted turn.
   * NOT set for the normal queue path — queued follow-ups stream on the
   * same session and don't interrupt anything.
   */
  interruptInProgress: boolean;
  /** Client ids for follow-ups sent while a turn is processing and not yet echoed by the SDK. */
  pendingFollowUpClientMessageIds: string[];
  /** Client ids for follow-ups accepted into the current turn. Used to anchor the assistant bubble before interjections. */
  acceptedFollowUpClientMessageIds: string[];
  /** Follow-ups promoted to a clean next turn; their SDK echo should not be treated as a live interjection. */
  promotedFollowUpClientMessageIds: Set<string>;
  /** Actual model ID returned by the SDK (e.g. "claude-opus-4-8"). Set from the first assistant message each turn. */
  resolvedModel?: string;
  /**
   * True once a specific error banner has been surfaced for the in-flight turn
   * (from an assistant-message `error` field). Suppresses the generic
   * terminal-reason banner in the result handler so a single failure (e.g.
   * `overloaded`) doesn't double-up. Reset at each turn boundary.
   */
  turnErrorSurfaced?: boolean;
  unsubscribePlanActions: () => void;
  unsubscribeClaudeMdUpdate: () => void;
  unsubscribeDocumentUpdate: () => void;
  unsubscribeFileDelete: () => void;
}

// =============================================================================
// Configuration (accessed via getConfig().session)
// =============================================================================

// Helper to get session config values
const getSessionConfig = () => getConfig().session;

// =============================================================================
// Dependencies
// =============================================================================

export interface StreamingSessionServiceDeps {
  /** Project repository for session persistence */
  projectRepository: {
    get(id: string): Project | undefined;
    updateTokens(id: string, tokens: { input: number; output: number; total: number }): void;
  };

  /**
   * Record token usage and cost for a chat result. Called once per turn
   * when the SDK delivers a `result` message with usage stats. Falls back
   * to no-op if not provided (so older tests don't break).
   */
  recordUsage?: (event: {
    projectId: string;
    model: string | null | undefined;
    usage: {
      input_tokens?: number | null;
      output_tokens?: number | null;
      cache_creation_input_tokens?: number | null;
      cache_read_input_tokens?: number | null;
    };
    totalCostUsd?: number | null;
    sdkSessionId?: string | null;
    sdkResultUuid?: string | null;
    sdkCostScope?: string | null;
    isCumulativeCostSnapshot?: boolean;
  }) => void;

  /** Chat message repository for persisting messages */
  chatMessageRepository: {
    addMessage(
      sessionId: string,
      role: 'user' | 'assistant',
      content: string,
      chatSessionId?: string,
      clientMessageId?: string,
      provider?: ChatProvider
    ): void;
    getMessagesByChatSession(
      sessionId: string,
      chatSessionId: string
    ): { role: 'user' | 'assistant'; content: string }[];
  };

  /** Chat session repository for Claude SDK session ID storage */
  chatSessionRepository: {
    get(id: string): {
      claude_session_id: string | null;
      provider?: ChatProvider | null;
      provider_session_id?: string | null;
      title: string | null;
      scope?: ChatSessionScope | null;
    } | undefined;
    create(id: string, projectId: string, provider?: ChatProvider): { id: string };
    updateClaudeSessionId(id: string, claudeSessionId: string): void;
    updateProviderSessionId?(id: string, provider: ChatProvider, providerSessionId: string): void;
    updateTitle(id: string, title: string): void;
    clearClaudeSessionIdsByProject(projectId: string): void;
    clearProviderSessionIdsByProject?(projectId: string): void;
  };

  /** Function to get the main window for IPC */
  getMainWindow: () => BrowserWindow | null;

  /** Build context for main chat sessions */
  buildContext: (projectId: string) => PlanContext | null;

  /** Build SDK options from context */
  buildSdkOptions: (
    context: PlanContext,
    options: {
      model: ModelType;
      effort?: 'low' | 'medium' | 'high' | 'max';
      currentView?: ViewMode;
      resumeSessionId?: string;
      mainWindow: BrowserWindow | null;
      onClaudeMdEdit?: (projectId: string, newContent: string) => void;
      onProjectFileWrite?: (projectId: string, filePath: string, content: string) => void;
      peekPendingFile?: (relativeFilePath: string) => string | undefined;
      onElicitation?: OnElicitation;
      autoApprove?: boolean;
    }
  ) => SDKOptions;

  /** Subscribe to plan actions from MCP tools */
  subscribeToPlanActions: (callback: (event: PlanActionsEvent) => void) => () => void;

  /** Subscribe to project context file update proposals from MCP tools */
  subscribeToClaudeMdUpdate: (callback: (update: ClaudeMdUpdatePayload) => void) => () => void;

  /** Subscribe to document update proposals from MCP tools */
  subscribeToDocumentUpdate: (callback: (update: DocumentUpdatePayload) => void) => () => void;

  /** Subscribe to file deletion proposals from MCP tools */
  subscribeToFileDelete: (callback: (payload: FileDeletePayload) => void) => () => void;

  /** Read project context file (AGENTS.md or CLAUDE.md) content for a project */
  readClaudeMd: (projectId: string) => Promise<{ success: boolean; content: string | null; filename?: string; error?: string }>;

  /** Read a document file from the docs/ directory */
  readDocumentFile: (
    projectId: string,
    filePath: string
  ) => Promise<{ success: boolean; content: string | null; error?: string }>;

  /** Called when MCP server statuses are available from session init */
  onMcpStatusReady?: (mcpStatus: McpServerStatus[]) => void;

  /** Optional tool call logger for observability */
  toolCallLogger?: {
    logToolCall(entry: ToolCallLogEntry): void;
    finalizeTurn(projectId: string, chatSessionId: string): unknown;
    getCurrentTurnIndex(chatSessionId: string): number;
  };

  /** Optional centralized scheduler for cleanup/health ticks. */
  scheduler?: Pick<PollScheduler, 'register' | 'start' | 'unregister'>;

  /**
   * Whether the text invokes a known user slash command. The SDK only expands
   * commands at the start of a message, so command turns must skip context
   * prefixes that would displace the leading slash.
   */
  isSlashCommand?: (text: string) => boolean;
}

// =============================================================================
// Provider Adapter
// =============================================================================

/**
 * Provider-specific behavior for a chat session — which repository columns
 * back resume/session-id persistence, how usage is attributed by model, and
 * whether a session-summary lookup exists at all. Callers key into this
 * table instead of branching on `provider === 'claude' | 'codex'`.
 */
interface ChatProviderConfig {
  usageModel: (managed: Pick<ManagedSession, 'model'>) => string;
  resolveResumeSessionId: (
    chatSession: ReturnType<StreamingSessionServiceDeps['chatSessionRepository']['get']>
  ) => string | undefined;
  persistSessionId: (
    repo: StreamingSessionServiceDeps['chatSessionRepository'],
    chatSessionId: string,
    sessionId: string
  ) => void;
  /** Absent for providers with no session-summary concept (e.g. Codex). */
  fetchSessionSummary?: (sdkSessionId: string) => Promise<{ summary?: string } | undefined>;
}

export const CHAT_PROVIDER_CONFIG: Record<ChatProvider, ChatProviderConfig> = {
  claude: {
    usageModel: (managed) => managed.model,
    resolveResumeSessionId: (chatSession) => chatSession?.claude_session_id ?? undefined,
    persistSessionId: (repo, chatSessionId, sessionId) => {
      repo.updateClaudeSessionId(chatSessionId, sessionId);
      repo.updateProviderSessionId?.(chatSessionId, 'claude', sessionId);
    },
    fetchSessionSummary: getSessionInfo,
  },
  codex: {
    usageModel: () => 'codex',
    resolveResumeSessionId: (chatSession) =>
      chatSession?.provider === 'codex' ? chatSession.provider_session_id ?? undefined : undefined,
    persistSessionId: (repo, chatSessionId, sessionId) => {
      repo.updateProviderSessionId?.(chatSessionId, 'codex', sessionId);
    },
  },
};

/**
 * Apply the shared session-ready transition once a provider's native session
 * reports it can accept turns: mark the managed session as processing,
 * persist its resume id via the provider's config, and notify the renderer.
 * `mcpStatus` is omitted entirely for providers that don't report it (e.g.
 * Codex) so `onMcpStatusReady` — which overwrites the saved managed-server
 * list — only fires when there's a real status to save.
 */
export function markSessionReady(
  managed: ManagedSession,
  params: {
    sessionId: string;
    provider: ChatProvider;
    chatSessionId?: string;
    persistHistory: boolean;
    mcpStatus?: McpServerStatus[];
    projectId: string;
    mainWindow: BrowserWindow | null;
    chatSessionRepository: StreamingSessionServiceDeps['chatSessionRepository'];
    onMcpStatusReady?: (mcpStatus: McpServerStatus[]) => void;
  },
): void {
  managed.state = 'processing';
  managed.processingStartTime = Date.now();
  managed.lastSdkActivity = Date.now();
  managed.sessionId = params.sessionId;
  managed.lastTurnFinalized = false;
  if (params.chatSessionId && params.persistHistory) {
    CHAT_PROVIDER_CONFIG[params.provider].persistSessionId(
      params.chatSessionRepository,
      params.chatSessionId,
      params.sessionId
    );
  }
  params.mainWindow?.webContents.send('chat:session-ready', {
    projectId: params.projectId,
    chatSessionId: params.chatSessionId,
    sessionId: params.sessionId,
    mcpStatus: params.mcpStatus ?? [],
  });
  if (params.mcpStatus) {
    params.onMcpStatusReady?.(params.mcpStatus);
  }
}

// =============================================================================
// Turn-Result Finalization
// =============================================================================

/**
 * Finalize a completed turn on receipt of the SDK's 'result' message:
 * queued-follow-up promotion, error/truncation banners, message persistence,
 * tool-call-log finalization, segment/tool-activity reset, session-title
 * fetch, auth-error teardown, and usage/cost recording. Statement order
 * within this function is load-bearing (see inline comments on chat:done
 * ordering) — callers should not reorder these steps.
 */
export function finalizeTurnResult(
  key: string,
  projectId: string,
  chatSessionId: string,
  managed: ManagedSession,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sdkMsg: any,
  mainWindow: BrowserWindow | null,
  deps: {
    chatMessageRepository: StreamingSessionServiceDeps['chatMessageRepository'];
    chatSessionRepository: StreamingSessionServiceDeps['chatSessionRepository'];
    toolCallLogger?: StreamingSessionServiceDeps['toolCallLogger'];
    recordUsage?: StreamingSessionServiceDeps['recordUsage'];
    projectRepository: StreamingSessionServiceDeps['projectRepository'];
    disconnectSession: (key: string, options?: { silent?: boolean; reason?: string; source?: string }) => Promise<void>;
  },
): void {
  // In streaming-input mode the SDK input generator may already be waiting
  // on pull(), so a mid-turn send can be handed straight to the model as
  // steering input for THIS turn and answered in place; no second `result`
  // ever arrives. Treat a follow-up as pending only when it is still sitting
  // unconsumed in the SDK input queue.
  const hasQueuedFollowUp = managed.session.pendingQueuedCount() > 0;
  const nextQueuedClientMessageId = hasQueuedFollowUp ? managed.pendingFollowUpClientMessageIds[0] : undefined;
  // The first follow-up the SDK consumed as steering input for THIS turn.
  // Surfaced as `consumedQueuedClientMessageId` so the renderer drops the
  // message's optimistic "queued" badge. It is deliberately NOT used to
  // anchor the assistant bubble: this turn answered these interjections, so
  // the finalized bubble must land AFTER them in the transcript, never above
  // the very messages it responded to (see `beforeClientMessageId` below).
  const firstLiveFollowUpClientMessageId =
    managed.acceptedFollowUpClientMessageIds[0]
    ?? (!hasQueuedFollowUp ? managed.pendingFollowUpClientMessageIds[0] : undefined);

  if (!hasQueuedFollowUp && managed.pendingFollowUpClientMessageIds.length > 0) {
    for (const clientMessageId of managed.pendingFollowUpClientMessageIds) {
      sendQueueCleared(mainWindow, projectId, chatSessionId, clientMessageId, 'already_sent');
      managed.acceptedFollowUpClientMessageIds.push(clientMessageId);
    }
    managed.pendingFollowUpClientMessageIds = [];
  }
  // A queued follow-up means the SDK is about to pull the next message
  // and start another turn. Stay in 'processing' so concurrent sends
  // still route to the queue path (rather than racing into the brief
  // 'ready' window). Reset turn-timing fields for the new turn.
  if (hasQueuedFollowUp) {
    if (managed.chatSessionId) clearPendingDocumentContent(managed.chatSessionId);
    managed.processingStartTime = Date.now();
    managed.lastSdkActivity = Date.now();
  } else {
    resetToReady(managed);
    // The SDK consumed any follow-up into this turn (or there was none).
  }
  const maxTokensReached = isMaxTokensReached(sdkMsg);

  // Check if response was truncated
  if (maxTokensReached) {
    console.log(`[StreamingSessionService] Response truncated (max_tokens) for ${key}`);
    mainWindow?.webContents.send('chat:truncated', {
      projectId,
      chatSessionId,
      reason: 'max_tokens',
    });
  }

  // Check if response hit max turns limit
  if (isMaxTurnsReached(sdkMsg)) {
    const numTurns = 'num_turns' in sdkMsg ? sdkMsg.num_turns : undefined;
    console.log(`[StreamingSessionService] Response truncated (max_turns: ${numTurns}) for ${key}`);
    sendChatError(mainWindow, projectId, chatSessionId, `Response reached the turn limit (${numTurns ?? 'unknown'} turns). Send another message to continue.`);
  }

  // Surface other terminal reasons that stopped the session. Skip when a
  // specific assistant-message error was already surfaced this turn (e.g.
  // an `overloaded` failure that also reports terminal_reason 'model_error')
  // so the user sees one actionable banner, not two.
  const terminalReason = getTerminalReason(sdkMsg);
  if (terminalReason && terminalReason !== 'completed' && terminalReason !== 'max_turns' && !managed.turnErrorSurfaced) {
    const terminalMessages: Partial<Record<typeof terminalReason, string>> = {
      aborted_tools: 'Response stopped: tool execution was aborted.',
      blocking_limit: 'Response stopped: rate limit reached. Send another message to continue.',
      hook_stopped: 'Response stopped by a hook.',
      stop_hook_prevented: 'Response stopped: a stop hook prevented continuation.',
      tool_deferred: 'Response paused: a tool is waiting for approval.',
      prompt_too_long: 'Response stopped: the prompt exceeded the context limit.',
      model_error: 'Response stopped due to a model error.',
      rapid_refill_breaker: 'Response stopped: too many rapid requests. Please wait a moment.',
    };
    const message = terminalMessages[terminalReason];
    if (message) {
      console.log(`[StreamingSessionService] Terminal reason: ${terminalReason} for ${key}`);
      sendChatError(mainWindow, projectId, chatSessionId, message);
    }
  }

  // Clear "Allow All Remaining" flag when response completes
  clientManager.clearAllowAllRemaining(projectId);

  // Detect auth error responses before resetting accumulatedResponse
  const finalResponse = managed.accumulatedResponse.trim();
  const isAuthError = /not logged in/i.test(finalResponse) && /\/login/i.test(finalResponse);

  // Persist and finalize — errors here must not prevent chat:done from being sent
  try {
    if (finalResponse && managed.persistHistory) {
      deps.chatMessageRepository.addMessage(
        projectId,
        'assistant',
        finalResponse,
        managed.chatSessionId,
        undefined,
        managed.provider,
      );
    }
  } catch (dbError) {
    console.error('[StreamingSessionService] Failed to persist assistant message:', dbError);
  }

  // Reset accumulated response for next turn
  managed.accumulatedResponse = '';

  try {
    deps.toolCallLogger?.finalizeTurn(projectId, chatSessionId);
  } catch (logError) {
    console.error('[StreamingSessionService] Failed to finalize tool call turn:', logError);
  }

  // Reset segment state for next turn
  managed.segmentState = {
    currentSegmentId: 0,
    hasTextInCurrentSegment: false,
    pendingActivities: [],
  };
  managed.toolUseActivities.clear();

  managed.lastTurnFinalized = true;
  if (!hasQueuedFollowUp) {
    mainWindow?.webContents.send('chat:session-ready', { projectId, chatSessionId });
  }
  // The aggregate sdkMsg.usage token counts are CUMULATIVE SUMS across all API
  // calls in the agent turn (one call per tool-use loop iteration). For the
  // context-window bar we want the occupancy of the FINAL API call, not the
  // billing total. BetaUsage.iterations is an array of per-call usage objects;
  // the last entry is the true context window snapshot. Fall back to the
  // aggregate only when iterations is empty (single-call, no-tool turns).
  const rawIterations = sdkMsg.usage?.iterations;
  const lastIter =
    Array.isArray(rawIterations) && rawIterations.length > 0
      ? rawIterations[rawIterations.length - 1]
      : null;
  const ctxSource = lastIter ?? sdkMsg.usage;

  mainWindow?.webContents.send('chat:done', {
    projectId,
    chatSessionId,
    model: managed.resolvedModel,
    hasQueuedFollowUp,
    queuedClientMessageId: nextQueuedClientMessageId,
    consumedQueuedClientMessageId: firstLiveFollowUpClientMessageId,
    // Anchor the finalized bubble before the still-queued follow-up that
    // becomes the NEXT turn (if any) — never before an interjection this
    // turn already consumed. Undefined when nothing is deferred, so the
    // bubble simply appends after the consumed follow-ups (chronological).
    beforeClientMessageId: nextQueuedClientMessageId,
    inputTokens: ctxSource?.input_tokens ?? undefined,
    outputTokens: ctxSource?.output_tokens ?? undefined,
    cacheReadTokens: ctxSource?.cache_read_input_tokens ?? undefined,
    cacheCreationTokens: ctxSource?.cache_creation_input_tokens ?? undefined,
    // BetaUsage has no context_window field; ModelUsage (sdkMsg.modelUsage)
    // has it but as the model's max capacity, not current usage. Leave it
    // undefined so ContextWindowBar falls back to resolveModelContextWindow.
    contextWindow: undefined,
  });

  // Clear the queued envelope now — the SDK has the message and is about
  // to feed it to Claude as the next turn. Any further sends on this
  // session start fresh.
  if (hasQueuedFollowUp && nextQueuedClientMessageId) {
    managed.promotedFollowUpClientMessageIds.add(nextQueuedClientMessageId);
  }

  if (hasQueuedFollowUp) {
    // Reset so that if the session ends before the second turn produces
    // its own result message, handleSessionEnd will NOT suppress lifecycle
    // events. Without this reset, lastTurnFinalized=true + state='processing'
    // triggers the suppression guard and the renderer never receives
    // chat:session-deactivated / chat:done — leaving isStreaming stuck.
    managed.lastTurnFinalized = false;
    managed.acceptedFollowUpClientMessageIds = [];
  } else {
    managed.acceptedFollowUpClientMessageIds = [];
    managed.promotedFollowUpClientMessageIds.clear();
  }

  // Fire-and-forget: fetch the SDK's session summary so the renderer can
  // show a meaningful tab title instead of the numeric "Claude N" label.
  // Auto-summary generation runs alongside the first turn, so this is the
  // earliest moment we can read it. Re-fetched after every turn so a
  // user-renamed session updates the UI on next reply too.
  const fetchSessionSummary = CHAT_PROVIDER_CONFIG[managed.provider].fetchSessionSummary;
  if (fetchSessionSummary && managed.sessionId && managed.persistHistory) {
    const sdkSessionId = managed.sessionId;
    void fetchSessionSummary(sdkSessionId)
      .then((info) => {
        if (!info?.summary) return;
        const title = sanitizeSessionTitle(info.summary, managed.titleSeed);
        if (!title) return;
        // Persist for the history dropdown so old sessions keep their
        // meaningful label after a reload, then notify the live UI.
        try {
          deps.chatSessionRepository.updateTitle(chatSessionId, title);
        } catch (err) {
          console.warn('[StreamingSessionService] updateTitle failed:', err);
        }
        mainWindow?.webContents.send('chat:session-title', {
          projectId,
          chatSessionId,
          title,
        });
      })
      .catch((err: unknown) => {
        console.warn('[StreamingSessionService] getSessionInfo failed:', err);
      });
  }

  // Unblock interrupt-and-send orchestration waiting on this result.
  // Runs after chat:done so the renderer can finalize its partial bubble
  // before the follow-up user turn starts streaming.
  if (managed.pendingInterruptResolver) {
    const resolve = managed.pendingInterruptResolver;
    managed.pendingInterruptResolver = undefined;
    resolve();
  }
  if (maxTokensReached) {
    sendChatError(mainWindow, projectId, chatSessionId, 'Response reached the output limit. Send another message to continue.');
  }

  // Auth error: tear down the session so the next message spawns a fresh subprocess
  // that picks up updated credentials after /login, then surface an actionable banner.
  if (isAuthError) {
    console.log(`[StreamingSessionService] Auth error detected for ${key} — tearing down session`);
    sendChatError(mainWindow, projectId, chatSessionId, 'Not logged in to Claude Code. Run /login in a terminal, then click Retry.');
    void deps.disconnectSession(key, { silent: true });
  }

  // Update usage stats (non-critical). Prefer the centralized usage
  // recorder when wired in — it persists per-event cost + the project
  // token rollup. Fall back to the raw token rollup for tests/older
  // callers that don't pass `recordUsage`.
  //
  // Per-model split: when a turn spawned subagents on a different model
  // (e.g. main Opus delegates to the `explorer` Sonnet subagent), the SDK
  // reports a per-model breakdown via `modelUsage`. Recording each model
  // separately is the correct attribution; collapsing into the parent
  // model would mislabel the subagent's tokens.
  try {
    const resultMsg = sdkMsg as {
      usage?: typeof sdkMsg.usage;
      total_cost_usd?: number | null;
      session_id?: string | null;
      uuid?: string | null;
      modelUsage?: Record<string, {
        inputTokens?: number;
        outputTokens?: number;
        cacheCreationInputTokens?: number;
        cacheReadInputTokens?: number;
        costUSD?: number;
      }>;
    };
    if (sdkMsg.usage) {
      if (deps.recordUsage) {
        const totalCostUsd = resultMsg.total_cost_usd;
        const perModel = resultMsg.modelUsage && Object.keys(resultMsg.modelUsage).length > 0
          ? Object.entries(resultMsg.modelUsage)
          : null;

        if (perModel) {
          for (const [modelId, mu] of perModel) {
            deps.recordUsage({
              projectId,
              model: modelId,
              usage: {
                input_tokens: mu.inputTokens ?? 0,
                output_tokens: mu.outputTokens ?? 0,
                cache_creation_input_tokens: mu.cacheCreationInputTokens ?? 0,
                cache_read_input_tokens: mu.cacheReadInputTokens ?? 0,
              },
              totalCostUsd: typeof mu.costUSD === 'number' ? mu.costUSD : null,
              sdkSessionId: resultMsg.session_id ?? null,
              sdkResultUuid: resultMsg.uuid ?? null,
              sdkCostScope: modelId,
              isCumulativeCostSnapshot: true,
            });
          }
        } else {
          deps.recordUsage({
            projectId,
            model: CHAT_PROVIDER_CONFIG[managed.provider].usageModel(managed),
            usage: sdkMsg.usage,
            totalCostUsd: totalCostUsd ?? null,
            sdkSessionId: resultMsg.session_id ?? null,
            sdkResultUuid: resultMsg.uuid ?? null,
            sdkCostScope: '__total__',
            isCumulativeCostSnapshot: true,
          });
        }
      } else {
        deps.projectRepository.updateTokens(projectId, {
          input: sdkMsg.usage.input_tokens ?? 0,
          output: sdkMsg.usage.output_tokens ?? 0,
          total: (sdkMsg.usage.input_tokens ?? 0) + (sdkMsg.usage.output_tokens ?? 0),
        });
      }
    }
  } catch (statsError) {
    console.error('[StreamingSessionService] Failed to update token stats:', statsError);
  }

  // Turn boundary: clear the per-turn error flag so the next turn starts
  // clean. Done after every error-banner check above (including the late
  // max-tokens one) so suppression only applies within this turn.
  managed.turnErrorSurfaced = false;
}

// =============================================================================
// Factory Function
// =============================================================================

export function createStreamingSessionService(deps: StreamingSessionServiceDeps) {
  const sessions = new Map<string, ManagedSession>();
  let cleanupInterval: NodeJS.Timeout | null = null;
  let cleanupTaskRegistered = false;

  // Start cleanup task on creation
  startCleanupTask();

  // ─────────────────────────────────────────────────────────────────────────────
  // Multi-Session Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Build session key from projectId and chatSessionId.
   * Key format: `chat:{projectId}:{chatSessionId}`
   */
  function buildSessionKey(projectId: string, chatSessionId: string): string {
    return `chat:${projectId}:${chatSessionId}`;
  }

  /**
   * Get all session keys for a project.
   */
  function getSessionKeysForProject(projectId: string): string[] {
    const prefix = `chat:${projectId}:`;
    return Array.from(sessions.keys()).filter(key => key.startsWith(prefix));
  }

  /**
   * Get count of active sessions for a project.
   */
  function getActiveSessionCount(projectId: string): number {
    return getSessionKeysForProject(projectId).length;
  }

  /**
   * Get info about all active sessions for a project.
   */
  function getActiveSessions(projectId: string): ActiveSessionInfo[] {
    const result: ActiveSessionInfo[] = [];
    const prefix = `chat:${projectId}:`;

    for (const [key, managed] of sessions) {
      if (key.startsWith(prefix) && managed.chatSessionId && managed.persistHistory) {
        const persisted = deps.chatSessionRepository.get(managed.chatSessionId);
        result.push({
          chatSessionId: managed.chatSessionId,
          scope: persisted?.scope ?? 'main',
          state: managed.state,
          isProcessing: managed.state === 'processing',
          title: persisted?.title ?? null,
        });
      }
    }

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Core Session Operations (main chat)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Wait for a session to become ready.
   */
  async function waitForSessionReady(key: string, timeoutMs: number): AsyncResult<void> {
    const startTime = Date.now();
    const pollInterval = getSessionConfig().sessionReadyPollIntervalMs;

    while (Date.now() - startTime < timeoutMs) {
      const managed = sessions.get(key);

      if (!managed) {
        return failure('Session disconnected while waiting');
      }

      if (managed.state === 'ready') {
        return success(undefined);
      }

      if (managed.state === 'error') {
        return failure('Session connection failed');
      }

      // Still connecting, wait and check again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return failure('Timeout waiting for session to connect');
  }

  /**
   * Send a message to an existing session, creating it if necessary.
   * Shared logic for main chat sessions.
   */
  async function sendMessageToSession(
    key: string,
    envelope: MessageEnvelope,
    clientMessageId: string | undefined,
    createSession: () => Promise<ServiceResult<{ sessionId: string }>>
  ): AsyncResult<void> {
    let managed = sessions.get(key);

    // Reject concurrent sends only while a session-restart-with-message is
    // mid-flight (view/model change). The default queue path no longer sets
    // this flag, so most follow-ups go straight to the queue.
    if (managed?.interruptInProgress) {
      return failure('Session is restarting. Please wait a moment before sending again.');
    }

    // Create new session with this message if none exists or error state
    if (!managed || managed.state === 'idle' || managed.state === 'error') {
      const createResult = await createSession();
      if (!createResult.ok) {
        return failure(createResult.error);
      }
      // Session was created and message was sent as initial message
      return success(undefined);
    }

    // Wait for connecting session to become ready (with timeout)
    if (managed.state === 'connecting') {
      const waitResult = await waitForSessionReady(key, getSessionConfig().sessionReadyTimeoutMs);
      if (!waitResult.ok) {
        return failure(waitResult.error);
      }
      managed = sessions.get(key);
    }

    if (managed?.state !== 'ready') {
      switch (managed?.state) {
        case 'processing':
          // Queue the follow-up behind the in-flight turn. The SDK pulls it
          // when the current turn finishes, preserving the partial response
          // and avoiding wasted compute. Explicit interrupt (chat:cancel)
          // remains available if the user actually wants to stop the turn.
          return queueMessageOnSession(key, envelope, clientMessageId);
        case 'connecting':
          return failure('Session is still connecting. Please wait a moment.');
        case 'error':
          return failure('Session encountered an error. Please try again.');
        case 'idle':
        case 'closing':
        case undefined:
          return failure('Session is not available. Please try again.');
      }
    }

    // Check if underlying session is still usable (may have ended after interrupt/abort)
    if (!managed.session.isReady()) {
      // Session ended - clean up and create new session with this message
      const reconnectMeta = {
        projectId: managed.projectId,
        chatSessionId: managed.chatSessionId,
        reason: 'reconnect_failed',
        source: 'sendMessageToSession:notReady',
      };
      await disconnectSession(key, { silent: true });
      const createResult = await createSession();
      if (!createResult.ok) {
        // Silent reconnect cleanup skips lifecycle IPC; emit deactivation on reconnect failure
        // so renderer doesn't keep stale active-session state.
        const mainWindow = deps.getMainWindow();
        mainWindow?.webContents.send('chat:session-deactivated', reconnectMeta);
        return failure(createResult.error);
      }
      return success(undefined);
    }

    // Clear pending document content cache from prior turns so edits
    // in this new message start fresh against on-disk content.
    if (managed.chatSessionId) clearPendingDocumentContent(managed.chatSessionId);

    managed.lastTurnFinalized = false;
    managed.state = 'processing';
    managed.processingStartTime = Date.now();
    managed.lastSdkActivity = Date.now();
    managed.lastActivity = Date.now();

    try {
      await runWithToolExecutionContext(
        { projectId: managed.projectId, chatSessionId: managed.chatSessionId },
        async () => {
          if (envelope.attachments && envelope.attachments.length > 0) {
            const blocks = await buildUserContentBlocks(envelope.text, envelope.attachments);
            managed.session.sendUserContent(blocks);
          } else {
            managed.session.send(envelope.text);
          }
        }
      );
      return success(undefined);
    } catch (error) {
      // Roll back the optimistic 'processing' transition so the session
      // doesn't appear stuck if the SDK send fails (e.g. attachment read
      // error).
      const current = sessions.get(key);
      if (current?.state === 'processing') {
        resetToReady(current);
      }
      return failure(`Failed to send message: ${(error as Error).message}`);
    }
  }

  /** Session creation config */
  interface SessionCreationConfig {
    key: string;
    projectId: string;
    chatSessionId?: string;
    provider: ChatProvider;
    initialMessage: MessageEnvelope;
    model: ModelType;
    effort?: 'low' | 'medium' | 'high' | 'max';
    resumeSessionId?: string;
    context: PlanContext;
    currentView?: ViewMode;
    persistHistory: boolean;
    forceApprovalReview: boolean;
    onMessage: (session: StreamingSession | CodexChatSession, msg: unknown) => void;
  }

  /**
   * Create and start a streaming session with an initial message.
   */
  async function createSession(config: SessionCreationConfig): AsyncResult<{ sessionId: string }> {
    const {
      key,
      projectId,
      chatSessionId,
      provider,
      initialMessage,
      model,
      effort,
      resumeSessionId,
      context,
      currentView,
      persistHistory,
      forceApprovalReview,
      onMessage,
    } = config;

    // Disconnect existing session
    await disconnectSession(key, {
      reason: 'create_session_preflight',
      source: 'createSession',
    });

    const mainWindow = deps.getMainWindow();

    // Notify UI that we're connecting
    mainWindow?.webContents.send('chat:session-connecting', { projectId, chatSessionId });

    // Create subscriptions FIRST so we can always clean them up
    // Store references outside try block to ensure cleanup on any error
    let unsubscribePlanActions: (() => void) | null = null;
    let unsubscribeClaudeMdUpdate: (() => void) | null = null;
    let unsubscribeDocumentUpdate: (() => void) | null = null;
    let unsubscribeFileDelete: (() => void) | null = null;

    try {
      const createClaudeSdkOptions = () => deps.buildSdkOptions(context, {
        model,
        effort,
        currentView,
        resumeSessionId,
        mainWindow,
        autoApprove: true,
        // Callback for intercepted context file edits from the permission handler
        onClaudeMdEdit: (editProjectId: string, newContent: string) => {
          // Read current context file for diff display
          void (async () => {
            const currentContent = await deps.readClaudeMd(editProjectId);
            mainWindow?.webContents.send('chat:claudemd-update', {
              projectId: editProjectId,
              oldContent: currentContent.success ? currentContent.content : null,
              newContent,
              forceReview: forceApprovalReview,
            });
            console.log(`[StreamingSessionService] Context file edit intercepted and emitted for project ${editProjectId}`);
          })().catch((error) => {
            console.error('[StreamingSessionService] Failed to read context file for intercepted edit:', error);
          });
        },
        // Returns pending content for a project-relative path so successive
        // Edit/Write calls to the same file in one turn accumulate instead of
        // each reading stale on-disk content (the interception denies the write).
        peekPendingFile: (relativeFilePath: string) =>
          peekPendingDocumentContent(chatSessionId, relativeFilePath),
        // Callback for intercepted project file writes from the permission handler
        onProjectFileWrite: (writeProjectId: string, filePath: string, content: string) => {
          // Record the proposed content so the next same-file edit this turn
          // builds on it rather than re-reading unchanged disk.
          recordPendingDocumentContent(chatSessionId, filePath, content);
          // Read current file for diff display
          void (async () => {
            const currentContent = await deps.readDocumentFile(writeProjectId, filePath);
            mainWindow?.webContents.send('chat:file-update', {
              projectId: writeProjectId,
              chatSessionId,
              filePath,
              content,
              oldContent: currentContent.success ? currentContent.content : null,
              forceReview: forceApprovalReview,
            });
            console.log(`[StreamingSessionService] Project file write intercepted and emitted: ${filePath}`);
          })().catch((error) => {
            console.error('[StreamingSessionService] Failed to read file for intercepted write:', error);
          });
        },
        // Handle MCP elicitation requests (auth flows, form input from managed servers).
        // Routes them to the renderer as permission-style prompts so the user can
        // approve/decline or complete OAuth flows.
        onElicitation: async (request, { signal }) => {
          if (!mainWindow) {
            return { action: 'decline' as const };
          }
          // For URL-mode elicitation (OAuth), open the URL and auto-accept
          if (request.mode === 'url' && request.url) {
            const { shell } = await import('electron');
            void shell.openExternal(request.url);
            return { action: 'accept' as const, content: {} };
          }
          // For form-mode elicitation, route to the permission prompt UI
          const result = await promptUser(mainWindow, projectId, `mcp_elicitation:${request.serverName}`, {
            message: request.message,
            mode: request.mode,
          }, {
            signal,
            title: request.title ?? `${request.serverName} requests input`,
            displayName: request.displayName ?? request.serverName,
            description: request.description ?? request.message,
          });
          return result.behavior === 'allow'
            ? { action: 'accept' as const, content: {} }
            : { action: 'decline' as const };
        },
      });

      // Subscribe to plan actions - store reference for cleanup
      unsubscribePlanActions = deps.subscribeToPlanActions((event) => {
        if (event.projectId !== projectId) return;
        if (event.chatSessionId !== chatSessionId) return;
        mainWindow?.webContents.send('chat:plan-actions', {
          projectId: event.projectId,
          chatSessionId: event.chatSessionId,
          actions: event.actions,
        });
      });

      // Subscribe to project context file update proposals from the tool
      unsubscribeClaudeMdUpdate = deps.subscribeToClaudeMdUpdate((update) => {
        const matchesSession = update.chatSessionId
          ? update.chatSessionId === chatSessionId
          : ['connecting', 'processing'].includes(sessions.get(key)?.state ?? '');

        if (
          update.projectId === projectId &&
          matchesSession
        ) {
          // The tool already read the file to validate old_string; reuse what
          // it captured rather than reading disk a second time.
          mainWindow?.webContents.send('chat:file-update', {
            projectId,
            chatSessionId,
            filePath: update.filename ?? DEFAULT_CONTEXT_FILENAME,
            content: update.newContent,
            oldContent: update.oldContent,
            forceReview: sessions.get(key)?.forceApprovalReview ?? forceApprovalReview,
          });
        }
      });

      // Subscribe to document update proposals from the tool
      unsubscribeDocumentUpdate = deps.subscribeToDocumentUpdate((update) => {
        const matchesSession = update.chatSessionId
          ? update.chatSessionId === chatSessionId
          : ['connecting', 'processing'].includes(sessions.get(key)?.state ?? '');

        if (
          update.projectId === projectId &&
          matchesSession
        ) {
          // The tool already has the pre-edit content (or null for create);
          // forward it instead of re-reading disk.
          mainWindow?.webContents.send('chat:file-update', {
            projectId,
            chatSessionId,
            filePath: update.filePath,
            content: update.content,
            oldContent: update.oldContent,
            forceReview: sessions.get(key)?.forceApprovalReview ?? forceApprovalReview,
          });
        }
      });

      // Subscribe to file deletion proposals from the tool
      unsubscribeFileDelete = deps.subscribeToFileDelete((payload) => {
        const matchesSession = payload.chatSessionId
          ? payload.chatSessionId === chatSessionId
          : ['connecting', 'processing'].includes(sessions.get(key)?.state ?? '');

        if (payload.projectId === projectId && matchesSession) {
          mainWindow?.webContents.send('chat:file-delete', {
            projectId,
            chatSessionId,
            path: payload.path,
            isDirectory: payload.isDirectory,
          });
        }
      });

      // Create streaming session — let required: const can't be referenced in its own initializer closures
      let session!: StreamingSession | CodexChatSession;
      // eslint-disable-next-line prefer-const
      session = provider === 'codex'
        ? new CodexChatSession({
            context,
            chatSessionId,
            resumeThreadId: resumeSessionId,
            onMessage: (msg) => onMessage(session, msg),
            onSessionEnd: (reason, error) => handleSessionEnd(key, session, reason, error),
            onReady: (sessionId) => {
              const managed = sessions.get(key);
              if (managed?.session !== session) {
                console.log(`[StreamingSessionService] Ignoring stale onReady for ${key}`);
                return;
              }
              markSessionReady(managed, {
                sessionId,
                provider,
                chatSessionId,
                persistHistory,
                projectId,
                mainWindow,
                chatSessionRepository: deps.chatSessionRepository,
              });
            },
          })
        : new StreamingSession({
            sdkOptions: createClaudeSdkOptions(),
            onMessage: (msg) => onMessage(session, msg),
            onSessionEnd: (reason, error) => handleSessionEnd(key, session, reason, error),
            onReady: (sessionId, mcpStatus) => {
              const managed = sessions.get(key);
              if (managed?.session !== session) {
                console.log(`[StreamingSessionService] Ignoring stale onReady for ${key}`);
                return;
              }
              // The initial user message is already in-flight during start(),
              // so this session should be considered processing until we receive
              // the result message for that first turn.
              markSessionReady(managed, {
                sessionId,
                provider,
                chatSessionId,
                persistHistory,
                mcpStatus,
                projectId,
                mainWindow,
                chatSessionRepository: deps.chatSessionRepository,
                onMcpStatusReady: deps.onMcpStatusReady,
              });
            },
            onMcpError: (failedServers) => {
              const managed = sessions.get(key);
              if (managed?.session === session) {
                managed.state = 'error';
              } else {
                console.log(`[StreamingSessionService] Ignoring stale onMcpError for ${key}`);
                return;
              }
              mainWindow?.webContents.send('chat:session-error', {
                projectId,
                chatSessionId,
                error: `MCP connection failed: ${failedServers.map(s => s.name).join(', ')}`,
              });
            },
            onSlashCommands: (commands, context) => {
              const visible = selectVisibleSlashCommands(commands, context);
              mainWindow?.webContents.send('chat:slash-commands', { projectId, chatSessionId, commands: visible });
            },
          });

      // Store managed session BEFORE calling start() to ensure cleanup on timeout/error
      // State = 'connecting' until start() resolves successfully
      sessions.set(key, {
        key,
        type: 'chat',
        projectId,
        chatSessionId,
        session,
        state: 'connecting',
        provider,
        model,
        lastActivity: Date.now(),
        currentView,
        titleSeed: initialMessage.titleSeed,
        mcpHealthStatus: 'healthy',
        mcpRecoveryAttempts: 0,
        segmentState: {
          currentSegmentId: 0,
          hasTextInCurrentSegment: false,
          pendingActivities: [],
        },
        toolUseActivities: new Map(),
        persistHistory,
        forceApprovalReview,
        accumulatedResponse: '',
        lastTurnFinalized: false,
        suppressLifecycleEventsOnEnd: false,
        interruptInProgress: false,
        pendingFollowUpClientMessageIds: [],
        acceptedFollowUpClientMessageIds: [],
        promotedFollowUpClientMessageIds: new Set(),
        unsubscribePlanActions,
        unsubscribeClaudeMdUpdate,
        unsubscribeDocumentUpdate,
        unsubscribeFileDelete,
      });

      // Start session WITH the initial message (required by SDK).
      // For attachments, build native multimodal blocks and seed them into
      // the SDK's first turn rather than waiting until after start() resolves.
      // Can throw on timeout or MCP connection failure.
      const seedContent =
        initialMessage.attachments && initialMessage.attachments.length > 0
          ? await buildUserContentBlocks(initialMessage.text, initialMessage.attachments)
          : initialMessage.text;
      await runWithToolExecutionContext({ projectId, chatSessionId }, () =>
        session.start(seedContent)
      );

      const managed = sessions.get(key);
      const sessionId = managed?.sessionId ?? '';

      return success({ sessionId });
    } catch (error) {
      // Log full error details for debugging
      console.error('[StreamingSessionService] Chat session connection failed:', error);
      if (error && typeof error === 'object') {
        if ('stderr' in error) console.error('[StreamingSessionService] stderr:', error.stderr);
        if ('stdout' in error) console.error('[StreamingSessionService] stdout:', error.stdout);
        if ('code' in error) console.error('[StreamingSessionService] code:', error.code);
      }

      // Clean up subscriptions - check both the managed session AND our local references
      // This ensures cleanup even if session storage failed
      const managed = sessions.get(key);
      if (managed) {
        managed.state = 'error';
        managed.suppressLifecycleEventsOnEnd = true;
        if (managed.chatSessionId) clearPendingDocumentContent(managed.chatSessionId);
        managed.unsubscribePlanActions();
        managed.unsubscribeClaudeMdUpdate();
        managed.unsubscribeDocumentUpdate();
        managed.unsubscribeFileDelete();
        try {
          await managed.session.close();
        } catch (closeError) {
          console.error('[StreamingSessionService] Failed to close session after connection failure:', closeError);
        }
      } else {
        // Session wasn't stored in map - clean up local references directly
        unsubscribePlanActions?.();
        unsubscribeClaudeMdUpdate?.();
        unsubscribeDocumentUpdate?.();
        unsubscribeFileDelete?.();
      }
      if (sessions.get(key)?.session === managed?.session) {
        sessions.delete(key);
      }

      mainWindow?.webContents.send('chat:session-error', {
        projectId,
        chatSessionId,
        error: (error as Error).message,
      });

      return failure(`Connection failed: ${(error as Error).message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Main Chat Sessions (unified for Plan and Workspace views)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Disconnect a specific chat session, or all sessions for a project.
   * @param projectId - Project ID
   * @param chatSessionId - Optional session ID. If omitted, disconnects ALL sessions for the project.
   */
  async function disconnectChatSession(projectId: string, chatSessionId?: string): AsyncResult<void> {
    if (chatSessionId) {
      // Disconnect specific session
      const key = buildSessionKey(projectId, chatSessionId);
      await disconnectSession(key, {
        reason: 'user_disconnect_specific',
        source: 'disconnectChatSession',
      });
    } else {
      // Disconnect all sessions for project (worktree switch / project close).
      // Also null out persisted claude_session_ids so the next send spawns a
      // fresh SDK session: resuming would re-use the old spawn-time cwd even
      // after the repo's active_worktree_path has changed.
      const keys = getSessionKeysForProject(projectId);
      await Promise.all(keys.map(key => disconnectSession(key, {
        reason: 'disconnect_all_sessions',
        source: 'disconnectChatSession',
      })));
      deps.chatSessionRepository.clearClaudeSessionIdsByProject(projectId);
      deps.chatSessionRepository.clearProviderSessionIdsByProject?.(projectId);
    }
    return success(undefined);
  }

  /** Options for sending a chat message */
  interface SendChatMessageOptions {
    provider?: ChatProvider;
    model?: ModelType;
    effort?: 'low' | 'medium' | 'high' | 'max';
    focusedResources?: { type: string; path: string }[];
    chatSessionId?: string;
    /** Current UI view - used for prompt customization */
    currentView?: ViewMode;
    /** Focus-reader document context for slim focused chat sessions */
    focusDocument?: FocusChatDocument;
    /** File attachments to attach to this turn as native multimodal content blocks */
    attachments?: ChatAttachment[];
    /** Renderer-supplied id for matching the queued user bubble back to its IPC event */
    clientMessageId?: string;
    /** Persist accepted messages and SDK metadata to normal chat history. */
    persistHistory?: boolean;
  }

  /**
   * Send a message in the main chat session.
   * Creates session with the message if no active session exists.
   * Used by both Plan and Workspace views (shared session/history).
   */
  async function sendChatMessage(
    projectId: string,
    message: string,
    options: SendChatMessageOptions = {}
  ): AsyncResult<void> {
    // chatSessionId is required for multi-session support
    const chatSessionId = options.chatSessionId;
    if (!chatSessionId) {
      return failure('chatSessionId is required');
    }

    const provider = options.provider ?? 'claude';
    const key = buildSessionKey(projectId, chatSessionId);
    const managed = sessions.get(key);

    // Provider changes require a fresh native session/thread. KPM-side chat
    // history remains intact and is replayed into the new provider when needed.
    if (managed && managed.provider !== provider) {
      await disconnectSession(key, {
        reason: 'provider_changed',
        source: 'sendChatMessage',
      });
    }

    // If view changed, disconnect and create new session
    const latestManaged = sessions.get(key);
    if (latestManaged && options.currentView && latestManaged.currentView !== options.currentView) {
      await disconnectSession(key, {
        reason: 'view_changed',
        source: 'sendChatMessage',
      });
    }

    // Inject focused-resource context into the message text so it is
    // accurate for every turn, regardless of when the session was created.
    // Context is captured at send time; plan-item bodies are inlined when
    // needed (requires a fresh context read for the current plan state).
    const focused = options.focusedResources as FocusedResource[] | undefined;
    let messageText = message;
    const isCommandTurn = deps.isSlashCommand?.(message) ?? false;
    if (focused && focused.length > 0 && !isCommandTurn) {
      const hasPlanItem = focused.some((r) => r.type === 'plan_item');
      const planItems = hasPlanItem ? (deps.buildContext(projectId)?.planItems ?? []) : [];
      const prefix = buildFocusedSection(focused, planItems);
      if (prefix.trim()) {
        messageText = `${prefix}\n\n${message}`;
      }
    }

    const envelope: MessageEnvelope = { text: messageText, titleSeed: message, attachments: options.attachments };
    return sendMessageToSession(
      key,
      envelope,
      options.clientMessageId,
      () => createChatSession(projectId, envelope, options),
    );
  }

  /**
   * Create and start a main chat session with an initial message.
   * Shared between Plan and Workspace views.
   * Enforces maximum concurrent sessions limit per project.
   */
  async function createChatSession(
    projectId: string,
    initialMessage: MessageEnvelope,
    options: SendChatMessageOptions = {}
  ): AsyncResult<{ sessionId: string }> {
    const project = deps.projectRepository.get(projectId);
    if (!project) {
      return failure('Project not found');
    }

    // chatSessionId is required for multi-session support
    const chatSessionId = options.chatSessionId;
    if (!chatSessionId) {
      return failure('chatSessionId is required');
    }

    const sessionKey = buildSessionKey(projectId, chatSessionId);
    const persistHistory = options.persistHistory ?? true;

    // Check if this specific session already exists (resuming)
    const existingSession = sessions.get(sessionKey);
    const isResume = !!existingSession;

    // Enforce session limit only for NEW sessions (not resumes)
    if (!isResume) {
      const activeCount = getActiveSessionCount(projectId);
      if (activeCount >= getSessionConfig().maxConcurrentSessionsPerProject) {
        return failure(`Maximum ${getSessionConfig().maxConcurrentSessionsPerProject} concurrent sessions reached. Close an existing session first.`);
      }
    }

    const context = deps.buildContext(projectId);
    if (!context) {
      return failure('Failed to build context');
    }

    // Add current view to context for prompt customization
    if (options.currentView) {
      (context as PlanContext & { currentView?: ViewMode }).currentView = options.currentView;
    }
    if (options.focusDocument) {
      context.focusDocument = options.focusDocument;
    }

    // Get or create chat session for Claude SDK session tracking
    let resumeSessionId: string | undefined;
    const provider = options.provider ?? 'claude';

    if (persistHistory) {
      // Look up existing chat session for resume
      const chatSession = deps.chatSessionRepository.get(chatSessionId);
      resumeSessionId = CHAT_PROVIDER_CONFIG[provider].resolveResumeSessionId(chatSession);

      // Create chat session entry if it doesn't exist yet
      if (!deps.chatSessionRepository.get(chatSessionId)) {
        deps.chatSessionRepository.create(chatSessionId, projectId, provider);
      }
    }

    // When spawning a fresh SDK session for a chat that already has KPM-side
    // history (e.g. after a worktree switch cleared the claude_session_id),
    // seed the fresh session with a replay of prior turns so the conversation
    // keeps its thread. Skipped for normal resumes — the SDK's own transcript
    // carries that context.
    if (persistHistory && !resumeSessionId) {
      const stored = deps.chatMessageRepository.getMessagesByChatSession(projectId, chatSessionId);
      const continuationHistory = buildContinuationHistory(stored);
      if (continuationHistory.length > 0) {
        context.continuationHistory = continuationHistory;
      }
    }

    return createSession({
      key: sessionKey,
      projectId,
      chatSessionId,
      provider,
      initialMessage,
      model: options.model ?? 'sonnet',
      effort: options.effort,
      resumeSessionId,
      context,
      currentView: options.currentView,
      persistHistory,
      forceApprovalReview: !!options.focusDocument,
      onMessage: (session, msg) => handleChatSessionMessage(projectId, chatSessionId, session, msg),
    });
  }

  /**
   * Get the state of a specific chat session.
   */
  function getChatSessionState(projectId: string, chatSessionId: string): SessionState {
    const key = buildSessionKey(projectId, chatSessionId);
    return sessions.get(key)?.state ?? 'idle';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Shared Operations
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Interrupt the current execution in a session.
   * Resets state to 'ready' so new messages can be sent.
   * If interrupt hangs, force-disconnects after timeout.
   */
  async function interrupt(sessionKey: string): AsyncResult<void> {
    const managed = sessions.get(sessionKey);
    if (!managed) {
      return failure('No active session');
    }

    // Drop any queued follow-up before interrupting. Stop means "halt
    // everything" — if the user wanted the queued message to still go out
    // after Stop, they wouldn't have pressed Stop. Tell the renderer so it
    // can clear the queued bubble.
    while (managed.pendingFollowUpClientMessageIds.length > 0 && managed.session.cancelLastQueued()) {
      const cancelledClientMessageId = managed.pendingFollowUpClientMessageIds.pop();
      const mainWindow = deps.getMainWindow();
      sendQueueCleared(mainWindow, managed.projectId, managed.chatSessionId, cancelledClientMessageId, 'cancelled');
    }

    const INTERRUPT_TIMEOUT_MS = 5000; // 5 seconds max for interrupt

    try {
      // Race interrupt against timeout
      const interruptPromise = managed.session.interrupt();
      const timeoutPromise = new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), INTERRUPT_TIMEOUT_MS)
      );

      const result = await Promise.race([interruptPromise, timeoutPromise]);

      if (result === 'timeout') {
        console.warn(`[StreamingSessionService] Interrupt timed out for ${sessionKey}, force disconnecting`);
        // Force disconnect since interrupt hung
        await disconnectSession(sessionKey, {
          reason: 'interrupt_timeout',
          source: 'interrupt',
        });
        return success(undefined);
      }

      // Reset state to ready so new messages can be sent
      resetToReady(managed);
      return success(undefined);
    } catch (error) {
      // If interrupt fails, try to disconnect the session
      console.error(`[StreamingSessionService] Interrupt failed for ${sessionKey}:`, error);
      await disconnectSession(sessionKey, {
        reason: 'interrupt_error',
        source: 'interrupt',
      });
      return success(undefined); // Return success since we cleaned up
    }
  }

  /**
   * Send a live follow-up while a turn is streaming. The Claude SDK may pull
   * this immediately as steering input for the current turn, or leave it in
   * the input queue to become the next turn. The renderer presents it as a
   * live interjection until the SDK/result events tell us which happened.
   */
  async function queueMessageOnSession(
    key: string,
    envelope: MessageEnvelope,
    clientMessageId: string | undefined,
  ): AsyncResult<void> {
    const managed = sessions.get(key);
    if (!managed) {
      return failure('No active session');
    }

    if (!managed.session.isReady()) {
      return failure('Session is not ready to accept messages.');
    }

    if (clientMessageId) {
      managed.pendingFollowUpClientMessageIds.push(clientMessageId);
    }

    try {
      if (envelope.attachments && envelope.attachments.length > 0) {
        const blocks = await buildUserContentBlocks(envelope.text, envelope.attachments);
        managed.session.sendUserContent(blocks);
      } else {
        managed.session.send(envelope.text);
      }
    } catch (error) {
      if (clientMessageId) {
        managed.pendingFollowUpClientMessageIds = managed.pendingFollowUpClientMessageIds.filter(id => id !== clientMessageId);
      }
      return failure(`Failed to add follow-up: ${(error as Error).message}`);
    }

    const mainWindow = deps.getMainWindow();
    mainWindow?.webContents.send('chat:queued', {
      projectId: managed.projectId,
      chatSessionId: managed.chatSessionId,
      clientMessageId,
    });

    return success(undefined);
  }

  /**
   * Cancel the message queued behind an in-flight turn, if any. The SDK
   * does not consume queued messages until a turn boundary, so cancelling
   * is reliable as long as the in-flight turn has not yet finished.
   */
  function cancelQueuedMessage(
    projectId: string,
    chatSessionId: string,
    requestedClientMessageId?: string,
  ): ServiceResult<void> {
    const key = buildSessionKey(projectId, chatSessionId);
    const managed = sessions.get(key);
    if (!managed) {
      const mainWindow = deps.getMainWindow();
      sendQueueCleared(mainWindow, projectId, chatSessionId, requestedClientMessageId, 'session_disconnected');
      return failure('No active session');
    }

    if (managed.pendingFollowUpClientMessageIds.length === 0) {
      const mainWindow = deps.getMainWindow();
      sendQueueCleared(mainWindow, projectId, chatSessionId, requestedClientMessageId, 'already_sent');
      return failure('No queued message to cancel');
    }

    const lastPendingId = managed.pendingFollowUpClientMessageIds[managed.pendingFollowUpClientMessageIds.length - 1];
    const clientMessageId = requestedClientMessageId ?? lastPendingId;
    if (requestedClientMessageId && requestedClientMessageId !== lastPendingId) {
      const mainWindow = deps.getMainWindow();
      sendQueueCleared(mainWindow, projectId, chatSessionId, clientMessageId, 'already_sent');
      return failure('Only the most recent unsent follow-up can be cancelled.');
    }

    const cancelled = managed.session.cancelLastQueued();

    if (!cancelled) {
      // SDK already pulled it — too late to cancel. Surface so the renderer
      // can clear the "queued" badge but keep the bubble (it's now in flight).
      const mainWindow = deps.getMainWindow();
      sendQueueCleared(mainWindow, projectId, chatSessionId, clientMessageId, 'already_sent');
      return failure('Message was already sent to the model.');
    }

    managed.pendingFollowUpClientMessageIds.pop();

    const mainWindow = deps.getMainWindow();
    sendQueueCleared(mainWindow, projectId, chatSessionId, clientMessageId, 'cancelled');
    return success(undefined);
  }

  /**
   * Change the model for a session.
   */
  async function setModel(sessionKey: string, model: ModelType): AsyncResult<void> {
    const managed = sessions.get(sessionKey);
    if (!managed) {
      return failure('No active session');
    }

    try {
      await managed.session.setModel(model);
      managed.model = model;
      return success(undefined);
    } catch (error) {
      return failure(`Failed to set model: ${(error as Error).message}`);
    }
  }

  /**
   * Dispose all sessions.
   * Called on app quit.
   */
  async function disposeAll(): Promise<void> {
    if (cleanupTaskRegistered && deps.scheduler) {
      deps.scheduler.unregister(CLEANUP_TASK_ID);
      cleanupTaskRegistered = false;
    } else if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }

    const keysToDispose = Array.from(sessions.keys());
    await Promise.all(keysToDispose.map(key => disconnectSession(key, {
      reason: 'dispose_all',
      source: 'disposeAll',
    })));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Internal Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  async function disconnectSession(
    key: string,
    options: { silent?: boolean; reason?: string; source?: string } = {}
  ): Promise<void> {
    const managed = sessions.get(key);
    if (!managed) return;
    const stateBefore = managed.state;

    if (managed.chatSessionId) clearPendingDocumentContent(managed.chatSessionId);
    managed.state = 'closing';
    managed.unsubscribePlanActions();
    managed.unsubscribeClaudeMdUpdate();
    managed.unsubscribeDocumentUpdate();
    managed.unsubscribeFileDelete();
    managed.suppressLifecycleEventsOnEnd = !!options.silent;

    // If a follow-up was queued behind a turn that never got to deliver it,
    // tell the renderer so the queued bubble can clear its pending indicator
    // (the message is lost — the user can resend after reconnect).
    if (managed.pendingFollowUpClientMessageIds.length > 0 && !options.silent) {
      const mainWindow = deps.getMainWindow();
      for (const clientMessageId of managed.pendingFollowUpClientMessageIds) {
        sendQueueCleared(mainWindow, managed.projectId, managed.chatSessionId, clientMessageId, 'session_disconnected');
      }
    }
    managed.pendingFollowUpClientMessageIds = [];
    managed.acceptedFollowUpClientMessageIds = [];
    managed.promotedFollowUpClientMessageIds.clear();

    try {
      await managed.session.close();
    } catch {
      // Ignore errors during close
    }

    // If handleSessionEnd already ran during close(), the session is already deleted
    // from the map and events were already sent. Only send events as a safety net if
    // close() didn't trigger the normal callback chain.
    if (sessions.has(key)) {
      sessions.delete(key);

      if (!options.silent) {
        const mainWindow = deps.getMainWindow();
        mainWindow?.webContents.send('chat:session-deactivated', {
          projectId: managed.projectId,
          chatSessionId: managed.chatSessionId,
          reason: options.reason ?? 'disconnect_fallback',
          source: options.source ?? 'disconnectSession',
          previousState: stateBefore,
        });
        mainWindow?.webContents.send('chat:done', {
          projectId: managed.projectId,
          chatSessionId: managed.chatSessionId,
        });
        console.log(`[StreamingSessionService] Disconnected session (events sent as fallback): ${key}`);
      } else {
        console.log(`[StreamingSessionService] Disconnected session silently for reconnect: ${key}`);
      }
    } else {
      console.log(`[StreamingSessionService] Disconnected session (events already sent by handleSessionEnd): ${key}`);
    }
  }

  /**
   * Handle messages from main chat session (unified for Plan and Workspace views).
   * Uses 'chat:*' IPC channels and persists to unified chat history.
   * All events include chatSessionId for routing to the correct session in the UI.
   */
  function handleChatSessionMessage(
    projectId: string,
    chatSessionId: string,
    sourceSession: StreamingSession | CodexChatSession,
    msg: unknown,
  ): void {
    const mainWindow = deps.getMainWindow();
    const key = buildSessionKey(projectId, chatSessionId);
    const managed = sessions.get(key);

    if (!managed) return;
    if (managed.session !== sourceSession) {
      console.log(`[StreamingSessionService] Ignoring stale onMessage for ${key}`);
      return;
    }

    // Track latest SDK activity for idle-while-processing detection
    managed.lastSdkActivity = Date.now();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sdkMsg = msg as any;

    // Note: Claude SDK session ID is captured in onReady callback and stored in chat_sessions table

    // When partial streaming is on, the main response text is revealed from
    // `stream_event` deltas below; the complete assistant message is then used
    // only for accumulation/persistence so we don't double-emit each segment.
    const streamPartialsEnabled = getConfig().claude.includePartialMessages;

    // Partial assistant deltas (includePartialMessages): reveal response text
    // token-by-token instead of one block per turn step. Only the main turn
    // drives the transcript — subagent deltas (parent_tool_use_id set) are
    // ignored here and surface as activity-card detail from the complete
    // subagent message instead. Suppressed during interrupt-and-send so late
    // old-turn tokens can't repopulate the next turn's empty streaming bubble.
    if (isPartialAssistantMessage(sdkMsg)) {
      if (sdkMsg.parent_tool_use_id == null && !managed.interruptInProgress) {
        const event = sdkMsg.event;
        if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          const deltaText: string = event.delta.text ?? '';
          if (deltaText) {
            const segState = managed.segmentState;
            // Drain activities queued by tool_use blocks since the last text run
            // so they render as a boundary before this segment's first token.
            const precedingActivities = segState.pendingActivities.length > 0
              ? [...segState.pendingActivities]
              : undefined;
            if (precedingActivities) segState.pendingActivities = [];
            mainWindow?.webContents.send('chat:chunk', {
              projectId,
              chatSessionId,
              text: deltaText,
              segmentId: segState.currentSegmentId,
              precedingActivities,
            });
          }
        }
      }
      return;
    }

    // Context-compaction boundary: the SDK summarized earlier conversation to
    // stay under the context limit. Surface a lightweight notice so the user
    // understands why earlier turns may now appear condensed.
    if (isCompactBoundaryMessage(sdkMsg)) {
      const trigger = sdkMsg.compact_metadata?.trigger;
      sendChatActivity(mainWindow, projectId, chatSessionId, {
        id: randomUUID(),
        type: 'other' as const,
        label: 'Context compacted',
        detail: trigger === 'manual'
          ? 'Earlier conversation summarized'
          : 'Earlier conversation summarized to free up context',
      });
      return;
    }

    // Handle assistant messages (text chunks)
    if (sdkMsg.type === 'assistant') {
      // Subagent messages (e.g. the read-only explorer) arrive with
      // parent_tool_use_id set when forwardSubagentText is on. Their text/
      // thinking must NOT enter the main transcript or persisted response —
      // we surface their progress on the parent activity card instead.
      const isSubagentMessage = sdkMsg.parent_tool_use_id != null;

      // Capture the SDK-resolved model ID (e.g. "claude-opus-4-8") so we can
      // display it accurately in the chat header instead of the short alias.
      // Skip subagent messages — the explorer runs on Sonnet and would mislabel
      // the header.
      if (!isSubagentMessage) {
        const msgModel = (sdkMsg.message as { model?: string } | undefined)?.model;
        if (msgModel) managed.resolvedModel = msgModel;
      }

      // An assistant message can carry an `error` category when the turn aborts
      // on an API/model failure (`overloaded`, `server_error`, `billing_error`,
      // …). Without surfacing it the turn just stops silently. Suppressed during
      // interrupt-and-send so a late old-turn error can't leak into the next turn.
      // Subagent errors surface via the Task tool_result, so don't double-band them here.
      if (!isSubagentMessage && typeof sdkMsg.error === 'string' && !managed.interruptInProgress) {
        const errorText = describeAssistantError(sdkMsg.error);
        if (errorText) {
          managed.turnErrorSurfaced = true;
          sendChatError(mainWindow, projectId, chatSessionId, errorText);
        }
      }

      const content = sdkMsg.message?.content || [];
      const segState = managed.segmentState;

      for (const block of content) {
        // Subagent text: roll the latest line onto the parent activity card's
        // detail (merge-by-id) so the user sees live progress, then skip — it
        // must not accumulate into the main response or stream as a chunk.
        if (isSubagentMessage) {
          if (block.type === 'text' && typeof block.text === 'string' && !managed.interruptInProgress) {
            const parentId = sdkMsg.parent_tool_use_id as string;
            const parent = managed.toolUseActivities.get(parentId);
            const line = block.text.split('\n').map((l: string) => l.trim()).find((l: string) => l.length > 0);
            if (parent && line) {
              const detail = line.length > 100 ? `${line.slice(0, 100)}…` : line;
              const updated: Activity = { ...parent, detail };
              managed.toolUseActivities.set(parentId, updated);
              sendChatActivity(mainWindow, projectId, chatSessionId, updated);
            }
          }
          // Subagent thinking/tool_use carry no main-transcript meaning beyond
          // the heartbeat already handled elsewhere — ignore the rest.
          continue;
        }

        if (block.type === 'tool_use') {
          // Tool use after text = new segment boundary
          if (segState.hasTextInCurrentSegment) {
            segState.currentSegmentId++;
            segState.hasTextInCurrentSegment = false;
          }

          // Track tool activity with rich context
          const activity = getToolActivity(block.name, block.input as Record<string, unknown>);
          if (activity) {
            // Queue activity for the next text segment
            segState.pendingActivities.push(activity);
            // Map the SDK tool_use id → activity so we can attach the diff
            // stats from the matching tool_use_result later.
            const toolUseId = (block as { id?: unknown }).id;
            if (typeof toolUseId === 'string') {
              managed.toolUseActivities.set(toolUseId, activity);
            }
            // Also send activity for real-time display during streaming —
            // suppress during interrupt-and-send so late old-turn activities
            // can't repopulate the next turn's activity indicator.
            sendChatActivityIfActive(managed, mainWindow, projectId, chatSessionId, activity);
          }

          // Tool call logging (additive - does not affect activity flow)
          if (deps.toolCallLogger) {
            try {
              const toolInput = block.input as Record<string, unknown>;
              const entry: ToolCallLogEntry = {
                id: randomUUID(),
                projectId,
                chatSessionId,
                turnIndex: deps.toolCallLogger.getCurrentTurnIndex(chatSessionId),
                toolName: block.name,
                toolCategory: activity?.type ?? 'other',
                input: toolInput,
                filePaths: extractFilePaths(block.name, toolInput),
                label: activity?.label ?? block.name,
                detail: activity?.detail,
                timestamp: Date.now(),
              };
              deps.toolCallLogger.logToolCall(entry);
            } catch (logError) {
              console.error('[StreamingSessionService] Tool call logging failed:', logError);
            }
          }
        }

        if (block.type === 'thinking' && block.thinking) {
          // Thinking blocks stream Claude's reasoning - send to renderer for display.
          // Suppressed during interrupt-and-send: late old-turn thinking would
          // leak into the next turn's reasoning display.
          sendChatThinkingIfActive(managed, mainWindow, projectId, chatSessionId, block.thinking);
        }

        if (block.type === 'text') {
          segState.hasTextInCurrentSegment = true;

          // Accumulate text for persistence (the partial response still gets
          // saved to the DB when the aborted turn's result is processed). This
          // is the authoritative copy regardless of streaming mode.
          managed.accumulatedResponse += block.text;

          // With partial streaming on, this text was already revealed token-by-
          // token from `stream_event` deltas (which also drained pendingActivities).
          // Re-emitting the whole block here would duplicate it, so stop after
          // accumulating.
          if (streamPartialsEnabled) {
            continue;
          }

          // Suppress chunk emission for the aborted turn while an
          // interrupt-and-send orchestration is in flight. The renderer has
          // already committed the partial bubble as an interrupted message;
          // forwarding late tokens would repopulate the next turn's empty
          // streaming state and produce a phantom assistant bubble.
          sendChatChunkIfActive(
            managed,
            mainWindow,
            projectId,
            chatSessionId,
            block.text,
            segState.currentSegmentId,
            segState.pendingActivities.length > 0 ? [...segState.pendingActivities] : undefined,
          );

          // Clear pending activities after attaching to text
          segState.pendingActivities = [];
        }
      }
    }

    // The SDK echoes every user turn back through onMessage as type:'user'.
    // When a plain user turn arrives (no tool_use_result), it means the SDK
    // has dequeued the message and started processing it. Use this as the
    // authoritative "message left the queue" signal to clear the queued badge
    // in the renderer immediately — earlier than waiting for chat:done.
    if (sdkMsg.type === 'user' && !sdkMsg.tool_use_result && managed.pendingFollowUpClientMessageIds.length > 0) {
      const acceptedClientMessageId = managed.pendingFollowUpClientMessageIds.shift();
      if (acceptedClientMessageId) {
        const wasPromoted = managed.promotedFollowUpClientMessageIds.delete(acceptedClientMessageId);
        if (!wasPromoted) {
          managed.acceptedFollowUpClientMessageIds.push(acceptedClientMessageId);
        }
        sendQueueCleared(mainWindow, projectId, chatSessionId, acceptedClientMessageId, 'already_sent');
      }
    }

    // Handle tool_use_result on user messages — attach diff stats to the
    // matching activity by tool_use_id and re-emit so the renderer updates
    // the existing card instead of pushing a new one.
    // Suppress during interrupt-and-send so late old-turn results can't
    // leak into the next turn's activity stream.
    if (sdkMsg.type === 'user' && sdkMsg.tool_use_result && !managed.interruptInProgress) {
      const content = sdkMsg.message?.content;
      const blocks = Array.isArray(content) ? content : [];
      for (const block of blocks) {
        if (block?.type !== 'tool_result') continue;
        const toolUseId = typeof block.tool_use_id === 'string' ? block.tool_use_id : null;
        if (!toolUseId) continue;
        const original = managed.toolUseActivities.get(toolUseId);
        if (!original) continue;

        const diff = extractDiffFromToolResult(sdkMsg.tool_use_result);
        if (!diff) continue;

        const updated: Activity = {
          ...original,
          diffStats: { additions: diff.additions, deletions: diff.deletions },
          diffHunks: diff.hunks.length > 0 ? diff.hunks : undefined,
        };
        managed.toolUseActivities.set(toolUseId, updated);
        sendChatActivity(mainWindow, projectId, chatSessionId, updated);
      }
    }

    // Handle tool-progress heartbeats — the SDK emits these for a still-running
    // tool. Attach the elapsed seconds to the matching activity by tool_use_id
    // and re-emit so the renderer shows a live timer on long calls (e.g. a
    // wide Grep or a slow Bash) instead of a frozen pulse. Merge-by-id on the
    // renderer means this updates the existing card rather than pushing a new
    // one — same mechanism as the diff-stats re-emit above.
    if (isToolProgressMessage(sdkMsg) && !managed.interruptInProgress) {
      const original = managed.toolUseActivities.get(sdkMsg.tool_use_id);
      // Only surface once a tool has run long enough to be worth a timer —
      // fast tools never get a distracting "0s/1s" flash.
      if (original && sdkMsg.elapsed_time_seconds >= 2) {
        const updated: Activity = {
          ...original,
          elapsedSeconds: Math.round(sdkMsg.elapsed_time_seconds),
        };
        managed.toolUseActivities.set(sdkMsg.tool_use_id, updated);
        sendChatActivity(mainWindow, projectId, chatSessionId, updated);
      }
    }

    // Handle informational banners — the SDK emits these for non-error status
    // lines, hook feedback (e.g. a UserPromptSubmit/Stop hook's block reason),
    // and slash-command output. Without surfacing them this feedback is dropped
    // silently. Suppressed during interrupt-and-send so a late old-turn banner
    // can't leak into the next turn.
    if (isInformationalMessage(sdkMsg) && !managed.interruptInProgress) {
      const content = (sdkMsg.content ?? '').trim();
      if (content) {
        if (sdkMsg.prevent_continuation) {
          // A hook denied continuation — the turn stops after this message.
          // Surface the reason prominently and mark the turn as already
          // explained so the generic terminal-reason banner is suppressed.
          managed.turnErrorSurfaced = true;
          sendChatError(mainWindow, projectId, chatSessionId, content);
        } else if (sdkMsg.level !== 'info') {
          // 'info' is transcript-only per the SDK; surface notice/suggestion/
          // warning as a lightweight activity (same channel as api_retry below).
          const label = sdkMsg.level === 'warning' ? 'Warning'
            : sdkMsg.level === 'suggestion' ? 'Suggestion'
            : 'Notice';
          sendChatActivity(mainWindow, projectId, chatSessionId, { id: randomUUID(), type: 'other' as const, label, detail: content });
        }
      }
    }

    // Handle model-refusal messages: the model declined the request on safety
    // grounds. Two variants from the SDK:
    //  - fallback: the SDK switched to a fallback model and the turn CONTINUES,
    //    so surface a lightweight notice (don't mark the turn errored). This
    //    also explains the model-badge swap (e.g. opus → sonnet) to the user.
    //  - no-fallback: the turn ENDS with no assistant text. Without surfacing
    //    it the turn dies silently. Show the explanation and mark the turn
    //    already-explained so the generic terminal-reason banner is suppressed.
    // Suppressed during interrupt-and-send so a late old-turn refusal can't leak
    // into the next turn.
    if (isModelRefusalFallbackMessage(sdkMsg)) {
      sendChatActivityIfActive(managed, mainWindow, projectId, chatSessionId, {
        id: randomUUID(),
        type: 'other' as const,
        label: 'Switched models',
        detail: `${sdkMsg.original_model} declined this request — continuing on ${sdkMsg.fallback_model}`,
      });
    }

    if (isModelRefusalNoFallbackMessage(sdkMsg) && !managed.interruptInProgress) {
      managed.turnErrorSurfaced = true;
      sendChatError(mainWindow, projectId, chatSessionId, describeModelRefusalNoFallback(sdkMsg));
    }

    // Handle API retry messages — surface to UI as activity
    if (isApiRetryMessage(sdkMsg)) {
      const delaySec = Math.round(sdkMsg.retry_delay_ms / 1000);
      const statusText = sdkMsg.error_status ? `HTTP ${sdkMsg.error_status}` : 'connection error';
      console.log(`[StreamingSessionService] API retry ${sdkMsg.attempt}/${sdkMsg.max_retries} (${statusText}, retry in ${delaySec}s) for ${key}`);
      sendChatActivity(mainWindow, projectId, chatSessionId, {
        id: randomUUID(),
        type: 'other' as const,
        label: 'Retrying',
        detail: `API ${statusText} — retrying in ${delaySec}s (attempt ${sdkMsg.attempt}/${sdkMsg.max_retries})`,
      });
    }

    // Handle rate limit events — surface warnings/rejections to UI
    if (isRateLimitEvent(sdkMsg)) {
      const info = sdkMsg.rate_limit_info;
      // Credit exhaustion (claude.ai subscription) is a distinct rejection from a
      // time-based rate limit: credits don't reset on a timer, so "resets in Xm"
      // would be misleading. The SDK flags it via errorCode (v0.3.179+).
      const outOfCredits = info.errorCode === 'credits_required';
      if (info.status === 'allowed_warning' || info.status === 'rejected') {
        const resetsIn = info.resetsAt ? Math.round((info.resetsAt - Date.now()) / 60_000) : undefined;
        const detail = outOfCredits
          ? `Out of credits${info.canUserPurchaseCredits ? ' — purchase more in your Claude account to continue' : ''}`
          : info.status === 'rejected'
            ? `Rate limited${resetsIn ? ` — resets in ${resetsIn}m` : ''}`
            : `Approaching rate limit${info.utilization ? ` (${Math.round(info.utilization * 100)}% used)` : ''}`;
        console.log(`[StreamingSessionService] Rate limit ${info.status}${outOfCredits ? ' (credits_required)' : ''}: ${detail} for ${key}`);
        sendChatActivity(mainWindow, projectId, chatSessionId, {
          id: randomUUID(),
          type: 'other' as const,
          label: outOfCredits ? 'Out of Credits' : info.status === 'rejected' ? 'Rate Limited' : 'Rate Limit Warning',
          detail,
        });
      }
    }

    // Handle result message (final stats)
    if (sdkMsg.type === 'result') {
      finalizeTurnResult(key, projectId, chatSessionId, managed, sdkMsg, mainWindow, {
        chatMessageRepository: deps.chatMessageRepository,
        chatSessionRepository: deps.chatSessionRepository,
        toolCallLogger: deps.toolCallLogger,
        recordUsage: deps.recordUsage,
        projectRepository: deps.projectRepository,
        disconnectSession,
      });
    }

    // Handle prompt suggestion (arrives after result message)
    if (sdkMsg.type === 'prompt_suggestion' && sdkMsg.suggestion) {
      mainWindow?.webContents.send('chat:suggestions', {
        projectId,
        chatSessionId,
        suggestions: [sdkMsg.suggestion],
      });
    }
  }

  function handleSessionEnd(
    key: string,
    sourceSession: StreamingSession | CodexChatSession,
    reason: string,
    error?: Error,
  ): void {
    const managed = sessions.get(key);
    if (!managed) return;
    const stateBefore = managed.state;
    if (managed.session !== sourceSession) {
      console.log(`[StreamingSessionService] Ignoring stale onSessionEnd for ${key} (${reason})`);
      return;
    }

    if (managed.chatSessionId) clearPendingDocumentContent(managed.chatSessionId);
    managed.unsubscribePlanActions();
    managed.unsubscribeClaudeMdUpdate();
    managed.unsubscribeDocumentUpdate();
    managed.unsubscribeFileDelete();

    sessions.delete(key);

    const mainWindow = deps.getMainWindow();
    const suppressRendererLifecycle =
      managed.suppressLifecycleEventsOnEnd ||
      // The turn was already finalized (chat:done emitted from result handler) and
      // this end callback is a post-turn teardown. Avoid emitting duplicate
      // deactivation/done events that can flip renderer state mid-recovery.
      (managed.lastTurnFinalized && stateBefore !== 'closing');

    if (suppressRendererLifecycle) {
      console.log(`[StreamingSessionService] Session ended after finalized turn; suppressing redundant lifecycle events: ${key} (${reason})`);
      return;
    }

    // Notify UI that session is deactivated (for multi-session UI updates)
    mainWindow?.webContents.send('chat:session-deactivated', {
      projectId: managed.projectId,
      chatSessionId: managed.chatSessionId,
      reason: `session_end_${reason}`,
      source: 'onSessionEnd',
      previousState: stateBefore,
    });

    // Ensure renderer always clears any pending streaming state for this session.
    mainWindow?.webContents.send('chat:done', {
      projectId: managed.projectId,
      chatSessionId: managed.chatSessionId,
    });

    if (reason === 'error' && error) {
      mainWindow?.webContents.send('chat:session-error', {
        projectId: managed.projectId,
        chatSessionId: managed.chatSessionId,
        error: error.message,
      });
    }

    console.log(`[StreamingSessionService] Session ended: ${key} (${reason})`);
  }

  /**
   * Check KPM MCP server health and attempt recovery if disconnected.
   * Called from the cleanup interval for idle-ready sessions.
   * After 3 consecutive failures, tears down the session so the next
   * user message creates a fresh one via sendMessageToSession.
   */
  async function checkAndRecoverMcpHealth(key: string, managed: ManagedSession): Promise<void> {
    const mainWindow = deps.getMainWindow();
    const maxRecoveryAttempts = getSessionConfig().mcpRecoveryMaxAttempts;

    // Lock: prevent concurrent recovery attempts from overlapping interval ticks
    managed.mcpHealthStatus = 'recovering';

    try {
      const statuses = await managed.session.mcpServerStatus();
      const kpmServer = statuses.find(s => s.name === 'kpm');

      // If kpm server is connected (or not reported at all), mark healthy
      if (!kpmServer || kpmServer.status === 'connected') {
        if (managed.mcpRecoveryAttempts > 0) {
          console.log(`[StreamingSessionService] KPM MCP server recovered for ${key}`);
          mainWindow?.webContents.send('chat:mcp-status', {
            projectId: managed.projectId,
            chatSessionId: managed.chatSessionId,
            serverName: 'kpm',
            status: 'connected',
          });
        }
        managed.mcpHealthStatus = 'healthy';
        managed.mcpRecoveryAttempts = 0;
        return;
      }

      // Server is not connected — attempt reconnection
      console.log(`[StreamingSessionService] KPM MCP server unhealthy (${kpmServer.status}) for ${key}, attempting reconnect`);
      await managed.session.reconnectMcpServer('kpm');

      // Verify reconnection
      const verifyStatuses = await managed.session.mcpServerStatus();
      const verifyKpm = verifyStatuses.find(s => s.name === 'kpm');

      if (verifyKpm?.status === 'connected') {
        console.log(`[StreamingSessionService] KPM MCP server reconnected for ${key}`);
        managed.mcpHealthStatus = 'healthy';
        managed.mcpRecoveryAttempts = 0;
        mainWindow?.webContents.send('chat:mcp-status', {
          projectId: managed.projectId,
          chatSessionId: managed.chatSessionId,
          serverName: 'kpm',
          status: 'connected',
        });
        return;
      }

      // Reconnect failed
      managed.mcpRecoveryAttempts++;
      managed.mcpHealthStatus = 'degraded';
      const errorMsg = verifyKpm?.error ?? `status: ${verifyKpm?.status ?? 'unknown'}`;
      console.warn(`[StreamingSessionService] KPM MCP reconnect failed for ${key} (attempt ${managed.mcpRecoveryAttempts}/${maxRecoveryAttempts}): ${errorMsg}`);

      mainWindow?.webContents.send('chat:mcp-status', {
        projectId: managed.projectId,
        chatSessionId: managed.chatSessionId,
        serverName: 'kpm',
        status: verifyKpm?.status ?? 'failed',
        error: `Reconnect failed (attempt ${managed.mcpRecoveryAttempts}/${maxRecoveryAttempts})`,
      });

      // After max attempts, tear down the session
      if (managed.mcpRecoveryAttempts >= maxRecoveryAttempts) {
        console.error(`[StreamingSessionService] KPM MCP recovery exhausted for ${key}, tearing down session`);
        await disconnectSession(key, {
          reason: 'mcp_recovery_failed',
          source: 'mcpHealthCheck',
        });
      }
    } catch (error) {
      // mcpServerStatus() or reconnect threw — likely dead subprocess
      console.error(`[StreamingSessionService] MCP health check error for ${key}:`, error);
      managed.mcpHealthStatus = 'degraded';
      // Don't increment attempts for infrastructure errors — existing dead-session
      // detection in sendMessageToSession will handle the dead session
    }
  }

  function runCleanupTick(): PollTickResult {
    const sessionConfig = getSessionConfig();
    const now = Date.now();
    const mainWindow = deps.getMainWindow();
    let processingTimeouts = 0;
    let idleTimeouts = 0;
    let healthChecks = 0;

    for (const [key, managed] of sessions) {
      if (managed.state === 'processing') {
        // Check for hung sessions: no SDK messages for processingIdleTimeoutMs
        const lastSdkMs = managed.lastSdkActivity ?? managed.processingStartTime;
        const idleSinceLastSdk = lastSdkMs ? now - lastSdkMs : 0;
        const totalProcessing = managed.processingStartTime ? now - managed.processingStartTime : 0;

        const isIdleHung = idleSinceLastSdk > sessionConfig.processingIdleTimeoutMs;
        const isHardTimeout = totalProcessing > sessionConfig.processingTimeoutMs;

        if (isIdleHung || isHardTimeout) {
          processingTimeouts++;
          const reason = isIdleHung
            ? `no SDK activity for ${Math.round(idleSinceLastSdk / 1000)}s`
            : `total processing exceeded ${Math.round(sessionConfig.processingTimeoutMs / 60000)} minutes`;
          console.log(`[StreamingSessionService] Processing timeout for ${key}: ${reason}`);
          resetToReady(managed);

          void interrupt(key).catch((error) => {
            console.error(`[StreamingSessionService] Failed to interrupt timed-out session ${key}:`, error);
          });

          const errorMessage = isIdleHung
            ? 'Response appears stuck. Please try again.'
            : `Response timed out after ${Math.round(sessionConfig.processingTimeoutMs / 60000)} minutes. Please try again.`;
          sendChatError(mainWindow, managed.projectId, managed.chatSessionId, errorMessage);
          // Also send chat:done to ensure isStreaming clears in the renderer
          mainWindow?.webContents.send('chat:done', {
            projectId: managed.projectId,
            chatSessionId: managed.chatSessionId,
          });
        }
        continue; // Skip idle check for processing sessions
      }

      // Check for idle sessions (same timeout for all idle sessions)
      const idleTimeout = sessionConfig.mainIdleTimeoutMs;

      if (now - managed.lastActivity > idleTimeout) {
        idleTimeouts++;
        console.log(`[StreamingSessionService] Idle timeout for ${key}`);
        disconnectSession(key, {
          reason: 'idle_timeout',
          source: 'cleanupTask',
        }).catch(console.error);
        continue;
      }

      // MCP health check for idle-ready sessions (not currently recovering)
      if (managed.state === 'ready' && managed.mcpHealthStatus !== 'recovering') {
        healthChecks++;
        void checkAndRecoverMcpHealth(key, managed);
      }
    }

    return {
      outcome: sessions.size > 0 ? 'ok' : 'noop',
      details: {
        sessionCount: sessions.size,
        processingTimeouts,
        idleTimeouts,
        healthChecks,
      },
    };
  }

  function startCleanupTask(): void {
    const sessionConfig = getSessionConfig();

    if (deps.scheduler) {
      deps.scheduler.register({
        id: CLEANUP_TASK_ID,
        intervalMs: sessionConfig.cleanupIntervalMs,
        handler: () => Promise.resolve(runCleanupTick()),
      });
      deps.scheduler.start(CLEANUP_TASK_ID);
      cleanupTaskRegistered = true;
      return;
    }

    cleanupInterval = setInterval(() => {
      Promise.resolve(runCleanupTick()).catch((error) => {
        console.error('[StreamingSessionService] Cleanup tick failed:', error);
      });
    }, sessionConfig.cleanupIntervalMs);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Return Service Interface
  // ─────────────────────────────────────────────────────────────────────────────

  return {
    // Main chat (unified for Plan and Workspace views, multi-session support)
    disconnectChatSession,
    sendChatMessage,
    getChatSessionState,
    getActiveSessions,
    interruptChatSession: (projectId: string, chatSessionId: string) =>
      interrupt(buildSessionKey(projectId, chatSessionId)),
    cancelQueuedChatMessage: (projectId: string, chatSessionId: string, clientMessageId?: string) =>
      cancelQueuedMessage(projectId, chatSessionId, clientMessageId),
    setChatModel: (projectId: string, chatSessionId: string, model: ModelType) =>
      setModel(buildSessionKey(projectId, chatSessionId), model),
    disposeAll,
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type StreamingSessionService = ReturnType<typeof createStreamingSessionService>;
