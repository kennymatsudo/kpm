/**
 * The one translation from a resolved Chat model choice (provider + model +
 * effort) to a live chat session and the record the service registers for it.
 *
 * Each provider reads a different subset of the launch — Claude takes SDK
 * options, Codex takes an app-server thread config, pi takes a native session
 * config — and every one of them narrows the Chat effort to a different set of
 * levels. Assembled inline, those answers were spread through the length of
 * createSession, and the callbacks built there each had to re-derive whether
 * they still belonged to the live session. The host hands them over already
 * bound to their launch, so that guard is written once.
 *
 * `start()` deliberately stays with the caller: this module never touches the
 * session registry, which is what lets a test assert a provider's launch
 * options with no window and no live SDK.
 */

import type { BrowserWindow } from 'electron';
import type { Options as SDKOptions, OnElicitation, SlashCommand } from '@anthropic-ai/claude-agent-sdk';
import { StreamingSession, type McpServerStatus, type SlashCommandContext } from '../../claude/streaming';
import { CodexChatSession } from '../../codex/CodexChatSession';
import { PiChatSession } from '../../pi/PiChatSession';
import { registerCodexMcpSession } from '../../codex/KpmCodexMcpServer';
import { buildPiKpmTools } from '../../pi/kpmToolAdapter';
import type { IChatSession } from './IChatSession';
import type { SessionEndReason } from './BaseTurnQueueChatSession';
import type { SegmentState } from './interpretSdkMessage';
import { createFollowUpQueue, type FollowUpQueue } from './followUpQueue';
import { createTurnLifecycle, type TurnLifecycle } from './turnLifecycle';
import { createTurnReport, type TurnReport } from './turnReport';
import type { McpElicitationDecision, McpElicitationRequest } from './mcpElicitation';
import type { ModelType } from '../../claude/sdkOptionsBuilder';
import type { PlanContext } from '../../chat/prompts';
import type { WriteDecision } from '../../chat/writeGrants';
import type { Activity, ChatChoiceEffort, ChatProvider } from '../../../shared/types';

export type SessionState = 'idle' | 'connecting' | 'ready' | 'processing' | 'error' | 'closing';

/** A live chat session plus the bookkeeping the service keeps beside it. */
export interface ManagedSession {
  key: string;
  projectId: string;
  session: IChatSession;
  state: SessionState;
  provider: ChatProvider;
  model: ModelType;
  /** pi-only `"<provider>/<modelId>"` selector used by this native session. */
  providerModel?: string;
  effort?: ChatChoiceEffort | null;
  lastActivity: number;
  sessionId?: string; // SDK session ID for resume
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
  hasStreamedResponseText: boolean; // True after this turn emitted text deltas, so complete blocks shouldn't re-render
  /** Single owner of "has this turn already ended" plus its timing (start/last-activity) for hang detection. */
  turn: TurnLifecycle;
  /** The only way a turn ends: settlement plus the renderer events it implies. */
  report: TurnReport;
  suppressLifecycleEventsOnEnd: boolean; // Suppress renderer lifecycle events when session ends
  /** Client ids for follow-ups sent while a turn is processing, and their acceptance/promotion state. */
  followUps: FollowUpQueue;
  /** Actual model ID returned by the SDK (e.g. "claude-opus-4-8"). Set from the first assistant message each turn. */
  resolvedModel?: string;
  /**
   * True once a specific error banner has been surfaced for the in-flight turn
   * (from an assistant-message `error` field). Suppresses the generic
   * terminal-reason banner in the result handler so a single failure (e.g.
   * `overloaded`) doesn't double-up. Reset at each turn boundary.
   */
  turnErrorSurfaced?: boolean;
  turnStartedAt?: number;
  /**
   * When the follow-up waiting behind the in-flight turn was queued. Kept apart
   * from `turnStartedAt` because the SDK may steer that message into the
   * current turn instead of starting a new one, and the current turn's start
   * must not move under it.
   */
  queuedFollowUpAt?: number;
  firstContentAt?: number;
  unsubscribeToolProposals: () => void;
}

/**
 * Everything a provider session reports back to, or asks of, the service.
 *
 * Every callback is already bound to the launch it belongs to: a session that
 * has since been replaced in the registry must be filtered out before these
 * run, never inside them.
 */
export interface ChatSessionHost {
  onMessage: (msg: unknown) => void;
  onSessionEnd: (reason: SessionEndReason, error?: Error) => void;
  /** `mcpStatus` is omitted by providers that cannot report their MCP servers. */
  onReady: (sessionId: string, mcpStatus?: McpServerStatus[]) => void;
  onMcpError: (failedServers: McpServerStatus[]) => void;
  onSlashCommands: (commands: SlashCommand[], context: SlashCommandContext) => void;
  /** The project write grant (P7). Asked on the first attempted write, not at launch. */
  requestWriteConsent: () => Promise<WriteDecision>;
  hasWriteAccess: () => boolean;
  /** Per-call approval for a provider that gates its own external tool calls. */
  requestApproval: (toolName: string, input: Record<string, unknown>) => Promise<boolean>;
  onElicitation: (
    request: McpElicitationRequest,
    options?: { signal?: AbortSignal },
  ) => Promise<McpElicitationDecision>;
  /** Content of a context-file edit the permission handler intercepted and denied. */
  onContextFileEdit: (projectId: string, newContent: string) => void;
  /** Content of a project-file write the permission handler intercepted and denied. */
  onProjectFileWrite: (projectId: string, filePath: string, content: string) => void;
  peekPendingFile: (relativeFilePath: string) => string | undefined;
}

export type BuildClaudeSdkOptions = (
  context: PlanContext,
  options: {
    model: ModelType;
    effort?: ClaudeEffort;
    resumeSessionId?: string;
    mainWindow: BrowserWindow | null;
    chatSessionId?: string;
    onContextFileEdit?: (projectId: string, newContent: string) => void;
    onProjectFileWrite?: (projectId: string, filePath: string, content: string) => void;
    peekPendingFile?: (relativeFilePath: string) => string | undefined;
    onElicitation?: OnElicitation;
  },
) => SDKOptions;

export interface ChatLaunchRequest {
  key: string;
  projectId: string;
  chatSessionId?: string;
  provider: ChatProvider;
  /** Claude's model. Other providers select with `providerModel`. */
  model: ModelType;
  providerModel?: string;
  effort?: ChatChoiceEffort | null;
  context: PlanContext;
  resumeSessionId?: string;
  persistHistory: boolean;
  forceApprovalReview: boolean;
  titleSeed?: string;
  mainWindow: BrowserWindow | null;
  /**
   * Resolved at emit time, not at launch: the window a session reports to can
   * be replaced while the session outlives it.
   */
  getMainWindow: () => BrowserWindow | null;
  /** Torn down by the caller, on launch failure or when the session ends. */
  unsubscribeToolProposals: () => void;
  buildClaudeSdkOptions: BuildClaudeSdkOptions;
  host: ChatSessionHost;
}

/**
 * The three provider session classes, injectable so a launch can be asserted
 * without constructing a real SDK client. They stay separate on purpose — an
 * earlier review rejected collapsing them into one class.
 */
export interface ChatSessionFactories {
  claude: (config: ConstructorParameters<typeof StreamingSession>[0]) => IChatSession;
  codex: (config: ConstructorParameters<typeof CodexChatSession>[0]) => IChatSession;
  pi: (config: ConstructorParameters<typeof PiChatSession>[0]) => IChatSession;
}

export const defaultChatSessionFactories: ChatSessionFactories = {
  claude: (config) => new StreamingSession(config),
  codex: (config) => new CodexChatSession(config),
  pi: (config) => new PiChatSession(config),
};

const CLAUDE_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
const CODEX_EFFORT_LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

type ClaudeEffort = (typeof CLAUDE_EFFORT_LEVELS)[number];
type CodexEffort = (typeof CODEX_EFFORT_LEVELS)[number];

function narrowEffort<T extends ChatChoiceEffort>(
  levels: readonly T[],
  effort: ChatChoiceEffort | null | undefined,
): T | undefined {
  return effort && (levels as readonly ChatChoiceEffort[]).includes(effort) ? (effort as T) : undefined;
}

/**
 * Claude receives elicitations through its SDK options rather than a callback
 * slot, and is the only provider whose elicitation can be cancelled by the
 * turn's abort signal.
 */
function toSdkElicitationHandler(host: ChatSessionHost): OnElicitation {
  return async (request, { signal }) => {
    const decision = await host.onElicitation(request, { signal });
    return { action: decision.action, ...(decision.content ? { content: decision.content } : {}) };
  };
}

export function buildChatSessionLaunch(
  request: ChatLaunchRequest,
  factories: ChatSessionFactories = defaultChatSessionFactories,
): { session: IChatSession; managed: ManagedSession } {
  const { provider, context, chatSessionId, projectId, host } = request;
  const focus = Boolean(context.focusDocument);

  const session = provider === 'codex'
    ? factories.codex({
        context,
        chatSessionId,
        resumeThreadId: request.resumeSessionId,
        model: request.providerModel,
        modelReasoningEffort: narrowEffort<CodexEffort>(CODEX_EFFORT_LEVELS, request.effort),
        onMessage: host.onMessage,
        onSessionEnd: host.onSessionEnd,
        onReady: host.onReady,
        registerMcpSession: () => registerCodexMcpSession({ projectId, chatSessionId, focus }),
        requestWriteConsent: host.requestWriteConsent,
        hasWriteAccess: host.hasWriteAccess,
        requestExternalApproval: host.requestApproval,
        onMcpElicitation: (elicitation) => host.onElicitation(elicitation),
      })
    : provider === 'pi'
    ? factories.pi({
        context,
        chatSessionId,
        resumeSessionId: request.resumeSessionId,
        model: request.providerModel,
        thinkingLevel: request.effort ?? undefined,
        onMessage: host.onMessage,
        onSessionEnd: host.onSessionEnd,
        onReady: host.onReady,
        kpmTools: buildPiKpmTools({ focus, projectId, chatSessionId }),
        requestWriteConsent: host.requestWriteConsent,
      })
    : factories.claude({
        sdkOptions: request.buildClaudeSdkOptions(context, {
          model: request.model,
          effort: narrowEffort<ClaudeEffort>(CLAUDE_EFFORT_LEVELS, request.effort),
          resumeSessionId: request.resumeSessionId,
          mainWindow: request.mainWindow,
          chatSessionId,
          onContextFileEdit: host.onContextFileEdit,
          onProjectFileWrite: host.onProjectFileWrite,
          peekPendingFile: host.peekPendingFile,
          onElicitation: toSdkElicitationHandler(host),
        }),
        onMessage: host.onMessage,
        onSessionEnd: host.onSessionEnd,
        onReady: host.onReady,
        onMcpError: host.onMcpError,
        onSlashCommands: host.onSlashCommands,
      });

  const now = Date.now();
  const turn = createTurnLifecycle();
  return {
    session,
    managed: {
      key: request.key,
      projectId,
      chatSessionId,
      session,
      state: 'connecting',
      provider,
      model: request.model,
      providerModel: request.providerModel,
      effort: request.effort,
      lastActivity: now,
      turnStartedAt: now,
      titleSeed: request.titleSeed,
      mcpHealthStatus: 'healthy',
      mcpRecoveryAttempts: 0,
      segmentState: {
        currentSegmentId: 0,
        hasTextInCurrentSegment: false,
        pendingActivities: [],
      },
      toolUseActivities: new Map(),
      persistHistory: request.persistHistory,
      forceApprovalReview: request.forceApprovalReview,
      accumulatedResponse: '',
      hasStreamedResponseText: false,
      turn,
      report: createTurnReport({
        turn,
        projectId,
        getChatSessionId: () => chatSessionId,
        getMainWindow: request.getMainWindow,
      }),
      suppressLifecycleEventsOnEnd: false,
      followUps: createFollowUpQueue(),
      unsubscribeToolProposals: request.unsubscribeToolProposals,
    },
  };
}
