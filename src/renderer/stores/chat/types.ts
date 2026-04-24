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
}

// Re-export types for consumers

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
  /** Suggested next prompts from the SDK (populated after each turn) */
  suggestions: string[];
  /** Sequential session number for display (e.g., "Session 1") */
  sessionNumber: number;
  /** Claude SDK session ID (for debugging) */
  claudeSessionId: string | null;
  mcpDegraded: boolean;
  /** Error message when MCP is degraded */
  mcpError: string | null;
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
  effort: AgentEffortLevel;
  totalTokens: number;
  sessionHistory: ChatSessionSummary[];

  // Session number counter for sequential naming
  nextSessionNumber: number;

  // Session management
  setViewedSession: (chatSessionId: string | null) => void;
  markSessionActive: (chatSessionId: string) => void;
  markSessionInactive: (chatSessionId: string) => void;
  removeSession: (chatSessionId: string) => void;

  // Per-session actions (operate on specific session by chatSessionId)
  setRetrying: (chatSessionId: string) => void;
  appendChunk: (chatSessionId: string, chunk: string, segmentId?: number, precedingActivities?: Activity[]) => void;
  appendThinking: (chatSessionId: string, text: string) => void;
  flushStreamingContent: (chatSessionId: string) => void;
  setError: (chatSessionId: string, error: string) => void;
  addActivity: (chatSessionId: string, activity: Activity) => void;
  clearError: (chatSessionId: string) => void;
  setSessionState: (chatSessionId: string, state: SessionState) => void;
  setDraftMessage: (chatSessionId: string, message: string) => void;
  setSuggestions: (chatSessionId: string, suggestions: string[]) => void;
  setClaudeSessionId: (chatSessionId: string, claudeSessionId: string) => void;
  setMcpStatus: (chatSessionId: string, degraded: boolean, error?: string | null) => void;

  // Shared actions
  setTokens: (tokens: number) => void;
  reset: () => void;
  resetProjectState: () => void;

  // Session history actions
  startNewChatSession: (keepCurrentActive?: boolean) => string;
  getChatSessionId: () => string;
  loadSessionHistory: (projectId: string) => Promise<void>;

  // Selectors
  getViewedSession: () => PerSessionState | null;
}

export type ChatSet = StoreApi<ChatState>['setState'];
export type ChatGet = StoreApi<ChatState>['getState'];
