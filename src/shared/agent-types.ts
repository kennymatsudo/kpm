/**
 * Agent Session Types
 *
 * Shared types for the board-driven agent execution system.
 * Used across main process (agent sessions) and renderer (activity feed, board cards).
 */

// =============================================================================
// Agent Types
// =============================================================================

/** Supported agent backends */
export type AgentType = 'claude' | 'codex' | 'gemini';

/** Agent session lifecycle states */
export type AgentSessionState =
  | 'starting'
  | 'working'
  | 'waiting_for_input'
  | 'complete'
  | 'failed'
  | 'stopped';

/** Role of an agent session — implementation or review */
export type AgentSessionRole = 'implement' | 'review';

// =============================================================================
// Activity Feed
// =============================================================================

/** A single activity entry in the agent's execution log */
export interface AgentActivity {
  /** Activity type — maps to SDK event types */
  type: 'tool_use' | 'tool_result' | 'thinking' | 'message' | 'error' | 'system';
  /** Unix timestamp (ms) */
  timestamp: number;
  /** Tool name for tool_use/tool_result (e.g. 'read_file', 'edit_file', 'bash') */
  toolName?: string;
  /** Tool input summary (e.g. file path, command) */
  toolInput?: string;
  /** Human-readable one-liner: "Reading src/auth/reset.ts" */
  summary: string;
  /** Full content (expandable in UI) */
  content?: string;
  /** Current status of this activity */
  status?: 'running' | 'success' | 'failed';
}

export interface AgentQuestionOption {
  label: string;
  description: string;
  preview?: string;
}

export interface AgentQuestionItem {
  question: string;
  header: string;
  options: AgentQuestionOption[];
  multiSelect: boolean;
}

/** A question the agent is asking the user */
export interface AgentQuestion {
  id: string;
  /** First question text — used as fallback when no structured questions */
  text: string;
  /** Structured multi-question format from AskUserQuestion tool */
  questions?: AgentQuestionItem[];
  timestamp: number;
}

// =============================================================================
// Completion & Review
// =============================================================================

/** Summary stats when an agent session completes */
export interface AgentCompletionSummary {
  filesChanged: number;
  additions: number;
  deletions: number;
  /**
   * Why the SDK query loop terminated. Surfaces cases like `max_turns`,
   * `aborted_tools`, `prompt_too_long`, `hook_stopped`, etc. so the UI can
   * distinguish a clean finish from a budget/abort/rate-limit exit.
   * ended before the SDK emitted a terminal reason.
   */
  terminalReason?: string;
}

/** A finding from an opposing-agent review or GitHub PR review */
export interface ReviewFinding {
  severity: 'critical' | 'warning' | 'suggestion';
  file: string;
  line?: number;
  description: string;
  /** Which agent produced this finding */
  agent: AgentType;
  /** Distinguish agent review from GitHub PR comments */
  source: 'agent' | 'pr';
}

/** Latest persisted opposing-agent review for an implementation session. */
export interface PersistedAgentReview {
  id: string;
  implementation_session_id: string;
  review_session_id: string;
  reviewer_agent: AgentType;
  diff_fingerprint: string | null;
  raw_output: string | null;
  findings: ReviewFinding[];
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Agent Session Events (Main Process → Renderer)
// =============================================================================

/**
 * Token usage emitted by a session when the underlying model returns a
 * result message with billable token counts. Only Claude SDK sessions
 * emit this — CLI agents (Codex, Gemini) are tracked separately.
 */
export interface AgentSessionUsage {
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  /**
   * SDK-reported total cost in USD for this turn, when available.
   * The centralized usage tracker prefers this over its local pricing table.
   */
  totalCostUsd: number | null;
  sdkSessionId?: string | null;
  sdkResultUuid?: string | null;
  sdkCostScope?: string | null;
  isCumulativeCostSnapshot?: boolean;
}

/** Events emitted by an AgentSession to its manager */
export interface AgentSessionEvents {
  onStateChange: (state: AgentSessionState) => void;
  onActivity: (activity: AgentActivity) => void;
  onQuestion: (question: AgentQuestion) => void;
  onComplete: (summary: AgentCompletionSummary) => void;
  onError: (error: string) => void;
  onUsage: (usage: AgentSessionUsage) => void;
}

// =============================================================================
// Agent Session Interface (Main Process)
// =============================================================================

/** The main process interface for controlling an agent session */
export interface IAgentSession {
  readonly id: string;
  readonly agentType: AgentType;
  readonly role: AgentSessionRole;
  readonly state: AgentSessionState;
  readonly activities: AgentActivity[];

  /** Start the agent in the given worktree with a prompt */
  start(worktreePath: string, prompt: string): Promise<void>;
  /** Answer an agent-initiated question */
  respond(text: string): Promise<void>;
  /** Post-completion follow-up (resumes the session) */
  followUp(text: string): Promise<void>;
  /** Stop the agent */
  stop(): Promise<void>;

  on<K extends keyof AgentSessionEvents>(event: K, handler: AgentSessionEvents[K]): void;
  off<K extends keyof AgentSessionEvents>(event: K, handler: AgentSessionEvents[K]): void;
  /** Remove every registered handler in one go — used when the session is being evicted. */
  clearHandlers(): void;
}

// =============================================================================
// IPC Payload Types (for renderer consumption)
// =============================================================================

/** Payload sent via IPC for agent-session:state-changed */
export interface AgentSessionStatePayload {
  sessionId: string;
  devSessionId: string;
  state: AgentSessionState;
}

/** Payload sent via IPC for agent-session:activity */
export interface AgentSessionActivityPayload {
  sessionId: string;
  devSessionId: string;
  activity: AgentActivity;
}

/** Payload sent via IPC for agent-session:question */
export interface AgentSessionQuestionPayload {
  sessionId: string;
  devSessionId: string;
  question: AgentQuestion;
}

/** Payload sent via IPC for agent-session:complete */
export interface AgentSessionCompletePayload {
  sessionId: string;
  devSessionId: string;
  role: AgentSessionRole;
  summary: AgentCompletionSummary;
  findings?: ReviewFinding[];
}

// =============================================================================
// Review Session ID Helpers
// =============================================================================

/** Derive the review session ID for a given implementation session ID */
export function toReviewSessionId(implSessionId: string): string {
  return `${implSessionId}-review`;
}

/** Derive the implementation session ID from a review session ID */
export function toImplSessionId(reviewSessionId: string): string {
  return reviewSessionId.replace(/-review$/, '');
}
