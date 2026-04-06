
/** Create initial state for a new session */
  messages: [],
  streamingSegments: [],
  streamingContent: '',
  streamingThinking: '',
  pendingActivities: [],
  isStreaming: false,
  error: null,
  activities: [],
  sessionState: 'idle',
  streamStartedAt: null,
  lastStreamUpdateAt: null,
  draftMessage: '',
  suggestions: [],
  sessionNumber,
  claudeSessionId: null,
  mcpDegraded: false,
  mcpError: null,
});

export const createInitialChatState = (): Pick<ChatState,
> => ({
  sessions: new Map(),
  activeSessionIds: new Set(),
  viewedSessionId: null,
  model: 'sonnet',
  totalTokens: 0,
  sessionHistory: [],
  nextSessionNumber: 1,
});
