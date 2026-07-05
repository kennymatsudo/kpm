import type { ClaudeModel, ChatEffortLevel, PerSessionState, ChatState } from './types';

/** Create initial state for a new session */
export const createInitialPerSessionState = (
  sessionNumber: number,
  model: ClaudeModel = 'sonnet',
  effort: ChatEffortLevel = 'medium',
): PerSessionState => ({
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
  model,
  effort,
  claudeSessionId: null,
  title: null,
  mcpDegraded: false,
  mcpError: null,
  lastTurnUsage: null,
  // Sessions created in-process have no DB history to fetch; restore shells
  // explicitly set this to false so setViewedSession lazy-loads them.
  hydrated: true,
});

export const createInitialChatState = (): Pick<ChatState,
  'sessions' | 'activeSessionIds' | 'viewedSessionId' | 'model' | 'effort' | 'totalTokens' | 'sessionHistory' | 'slashCommands' | 'slashCommandsSource' | 'nextSessionNumber' | 'persistedProjectId'
> => ({
  sessions: new Map(),
  activeSessionIds: new Set(),
  viewedSessionId: null,
  model: 'sonnet',
  effort: 'medium',
  totalTokens: 0,
  sessionHistory: [],
  slashCommands: [],
  slashCommandsSource: 'scan',
  nextSessionNumber: 1,
  persistedProjectId: null,
});
