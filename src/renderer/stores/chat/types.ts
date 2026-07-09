import type { Activity, ChatAttachment, SessionState, ClaudeModel, ChatProvider, ChatSessionSummary, MessageSegment, ChatEffortLevel, PiProviderOption, SlashCommandInfo, CodexChatModel } from '../../../shared/types';
import type { StoreApi } from 'zustand';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  /** Structured segments for single-bubble rendering with inline activities */
  segments: MessageSegment[];
  timestamp: Date;
  /**
   * True when this assistant response was cut short by the user sending a
   * follow-up message (or hitting stop). The UI renders a visual indicator
   * on the message to explain the truncation.
   */
  interrupted?: boolean;
  /** Wall-clock duration of the assistant turn that produced this message, in ms. */
  durationMs?: number;
  /** Model that produced this assistant message (e.g. "claude-sonnet-4-6"). */
  model?: string;
  /**
   * In-memory attachments rendered alongside this user message. Phase 2 only —
   * these do not survive a reload because attachment metadata isn't persisted
   * yet. Phase 3 plumbs DB persistence so attachments appear after reload.
   */
  attachments?: ChatAttachment[];
  /**
   * Renderer-supplied id used to correlate user messages with backend
   * `chat:queued` / `chat:queue-cleared` events. Only set on user messages.
   */
  clientMessageId?: string;
  /** True while a live follow-up has not yet been accepted by the SDK input stream. */
  queued?: boolean;
  /** Marks a user message sent while KPM was responding so it renders as a live interjection. */
  liveFollowUp?: boolean;
}

// Re-export types for consumers
export type { Activity, ClaudeModel, ChatProvider, MessageSegment, AgentEffortLevel, ChatEffortLevel, PiProviderOption, CodexChatModel } from '../../../shared/types';

/** Per-session state (each concurrent session has its own state) */
export interface PerSessionState {
  messages: Message[];
  /** Segments being built during streaming (single bubble with inline activities) */
  streamingSegments: MessageSegment[];
  /** Combined text content for display during streaming */
  streamingContent: string;
  /** Pending activities to be inserted before next text segment */
  pendingActivities: Activity[];
  isStreaming: boolean;
  error: string | null;
  /** Currently active activities (for real-time indicator) */
  activities: Activity[];
  sessionState: SessionState;
  /** Accumulated thinking content during streaming (Claude's reasoning) */
  streamingThinking: string;
  /** Timestamp when current streaming turn started */
  streamStartedAt: number | null;
  /** Timestamp of the last chunk/activity update for current streaming turn */
  lastStreamUpdateAt: number | null;
  /** Draft message persisted across view switches */
  draftMessage: string;
  /** Attachments staged for the next send, scoped to this session */
  pendingAttachments: ChatAttachment[];
  /** Suggested next prompts from the SDK (populated after each turn) */
  suggestions: string[];
  /** Sequential session number for display (e.g., "Session 1") */
  sessionNumber: number;
  /** SDK-derived display title (auto-summary or user-renamed). Falls back to sessionNumber when null. */
  title: string | null;
  /** Claude SDK session ID (for debugging) */
  claudeSessionId: string | null;
  /** Whether the KPM MCP server is degraded (tools unavailable) */
  mcpDegraded: boolean;
  /** Error message when MCP is degraded */
  mcpError: string | null;
  /**
   * True once `messages` has been hydrated from the DB (or the session was
   * created fresh in this process and never needed hydration). Restore tabs
   * start at `false` so `setViewedSession` can lazy-load them on first focus.
   */
  hydrated: boolean;
  /** Model selected for this session. Independent per tab. */
  model: ClaudeModel;
  /** Effort level selected for this session. Independent per tab. */
  effort: ChatEffortLevel;
  /** Chat backend provider for this session. Independent per tab, mirrors `model`. */
  provider: ChatProvider;
  /** Codex model selected for this session. Independent per tab. */
  codexModel: CodexChatModel;
  /** pi-only `"<provider>/<modelId>"` selection; meaningful only when `provider` is `'pi'`. */
  piProviderModel: string | undefined;
  /** Token counts from the most recently completed turn, for context window display. */
  lastTurnUsage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    /** Actual context window size for the model used, as reported by the SDK. */
    contextWindow: number | null;
  } | null;
}

export interface ChatState {
  // Per-session state stored by chatSessionId
  sessions: Map<string, PerSessionState>;

  // Active session tracking (sessions with running subprocess)
  activeSessionIds: Set<string>;

  // Currently viewed session
  viewedSessionId: string | null;

  // Shared state
  model: ClaudeModel;
  effort: ChatEffortLevel;
  provider: ChatProvider;
  /** Codex model default, inherited by new sessions. */
  codexModel: CodexChatModel;
  /** pi-only `"<provider>/<modelId>"` default, inherited by new sessions. */
  piProviderModel: string | undefined;
  /** pi.dev providers/models available for selection (empty until `loadPiProviders` resolves). */
  piProviders: PiProviderOption[];
  /** Whether pi.dev is configured at all — gates showing `pi` as a provider choice. */
  piProvidersAvailable: boolean;
  /** True once `loadPiProviders` has resolved at least once. */
  piProvidersLoaded: boolean;
  /** Provider ids the user has acknowledged the "runs its own agent" warning for. */
  piAcknowledgedUnsafeProviders: ReadonlySet<string>;
  totalTokens: number;
  sessionHistory: ChatSessionSummary[];
  /** User slash commands and skills shown in the composer typeahead */
  slashCommands: SlashCommandInfo[];
  /**
   * Where the current list came from. The filesystem scan seeds the menu at
   * boot; once a live session delivers the SDK's own list (which adds plugin
   * commands), later scans must not overwrite it.
   */
  slashCommandsSource: 'scan' | 'sdk';

  // Session number counter for sequential naming
  nextSessionNumber: number;

  // Project this store is currently scoped to. Set by `hydrateOpenSessions`
  // and consumed by the localStorage subscription in `index.ts` to know which
  // localStorage key to write on every tab-state change.
  persistedProjectId: string | null;

  // Session management
  getOrCreateSession: (chatSessionId: string, options?: { hydrated?: boolean }) => PerSessionState;
  setViewedSession: (chatSessionId: string | null) => void;
  markSessionActive: (chatSessionId: string) => void;
  markSessionInactive: (chatSessionId: string) => void;
  removeSession: (chatSessionId: string) => void;

  // Per-session actions (operate on specific session by chatSessionId)
  addUserMessage: (
    chatSessionId: string,
    content: string,
    attachments?: ChatAttachment[],
    options?: { queued?: boolean; liveFollowUp?: boolean; clientMessageId?: string },
  ) => void;
  /**
   * Find the user message with the given clientMessageId and clear its queued
   * flag. Called when the backend reports the queued message has been pulled
   * by the SDK (a new turn is starting) or cancelled/disconnected.
   */
  clearQueuedFlag: (chatSessionId: string, clientMessageId?: string) => void;
  /**
   * Remove a queued user message from the transcript when the backend confirms
   * that it was cancelled or lost before reaching the model.
   */
  removeQueuedUserMessage: (chatSessionId: string, clientMessageId: string) => void;
  setRetrying: (chatSessionId: string) => void;
  appendChunk: (chatSessionId: string, chunk: string, segmentId?: number, precedingActivities?: Activity[]) => void;
  appendThinking: (chatSessionId: string, text: string) => void;
  flushStreamingContent: (chatSessionId: string) => void;
  finalizeMessage: (
    chatSessionId: string,
    options?: {
      interrupted?: boolean;
      model?: string;
      beforeClientMessageId?: string;
      /**
       * When set, atomically hand off to a queued follow-up in the same update:
       * after committing the assistant bubble, clear this message's queued flag
       * and re-enter streaming for the next turn. Keeping it in one `set()`
       * prevents an intermediate render where a stale queued bubble shows
       * alongside a fresh thinking indicator. Implies `beforeClientMessageId`.
       */
      promoteQueuedClientMessageId?: string;
      /**
       * When set, this finalize ends the turn (no follow-up): clear the queued
       * flag from this message because the SDK absorbed it into the turn being
       * finalized. Unlike `promoteQueuedClientMessageId` it does NOT re-enter
       * streaming and does NOT anchor the assistant bubble before it — the
       * message was answered by this turn, so the bubble lands after it.
       */
      clearQueuedClientMessageId?: string;
    },
  ) => void;
  setError: (chatSessionId: string, error: string) => void;
  addActivity: (chatSessionId: string, activity: Activity) => void;
  updateActivity: (chatSessionId: string, activity: Activity) => void;
  clearError: (chatSessionId: string) => void;
  setSessionState: (chatSessionId: string, state: SessionState) => void;
  setDraftMessage: (chatSessionId: string, message: string) => void;
  setPendingAttachments: (chatSessionId: string, attachments: ChatAttachment[]) => void;
  setSuggestions: (chatSessionId: string, suggestions: string[]) => void;
  setClaudeSessionId: (chatSessionId: string, claudeSessionId: string) => void;
  setSessionTitle: (chatSessionId: string, title: string) => void;
  setMcpStatus: (chatSessionId: string, degraded: boolean, error?: string | null) => void;
  setLastTurnUsage: (chatSessionId: string, usage: PerSessionState['lastTurnUsage']) => void;

  // Shared actions
  setTokens: (tokens: number) => void;
  /** Refresh the slash command list from disk (cheap; called at boot and when the menu opens) */
  loadSlashCommands: () => Promise<void>;
  /** Replace the list with the SDK's authoritative one (init fetch or commands_changed push) */
  setSlashCommands: (commands: SlashCommandInfo[]) => void;
  setDefaultModel: (model: ClaudeModel) => void;
  setModel: (chatSessionId: string, model: ClaudeModel) => void;
  setEffort: (chatSessionId: string, effort: ChatEffortLevel) => void;
  /** Refresh the pi.dev provider/model list (cheap; called at boot and when the provider picker opens) */
  loadPiProviders: () => Promise<void>;
  setDefaultProvider: (provider: ChatProvider) => void;
  setProvider: (chatSessionId: string, provider: ChatProvider) => void;
  setDefaultCodexModel: (codexModel: CodexChatModel) => void;
  setCodexModel: (chatSessionId: string, codexModel: CodexChatModel) => void;
  setDefaultPiProviderModel: (piProviderModel: string | undefined) => void;
  setPiProviderModel: (chatSessionId: string, piProviderModel: string | undefined) => void;
  /** Record that the user has accepted the one-time warning for an unsafe pi provider. Persisted so it's asked once. */
  acknowledgeUnsafePiProvider: (provider: string) => Promise<void>;
  reset: () => void;
  resetProjectState: () => void;

  // Session history actions
  startNewChatSession: (keepCurrentActive?: boolean) => string;
  getChatSessionId: () => string;
  loadSessionHistory: (projectId: string) => Promise<void>;
  loadFromHistory: (projectId: string, chatSessionId: string, shouldContinue?: () => boolean) => Promise<void>;
  restoreLastSession: (projectId: string, shouldContinue?: () => boolean) => Promise<void>;
  hydrateOpenSessions: (projectId: string, shouldContinue?: () => boolean) => Promise<void>;

  // Selectors
  getViewedSession: () => PerSessionState | null;
}

export type ChatSet = StoreApi<ChatState>['setState'];
export type ChatGet = StoreApi<ChatState>['getState'];
