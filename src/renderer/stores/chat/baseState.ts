
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
  pendingAttachments: [],
  suggestions: [],
  sessionNumber,
  claudeSessionId: null,
  title: null,
  mcpDegraded: false,
  mcpError: null,
});

export const createInitialChatState = (): Pick<ChatState,
> => ({
  sessions: new Map(),
  activeSessionIds: new Set(),
  viewedSessionId: null,
  model: 'sonnet',
  effort: 'medium',
  totalTokens: 0,
  sessionHistory: [],
  nextSessionNumber: 1,
});
