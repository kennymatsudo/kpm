import type { ClaudeModel, ChatEffortLevel, ChatProvider, PerSessionState, ChatState, CodexChatModel } from './types';
import { DEFAULT_CODEX_CHAT_MODEL } from '../../../shared/types';

/** Create initial state for a new session */
export const createInitialPerSessionState = (
  sessionNumber: number,
  model: ClaudeModel = 'sonnet',
  effort: ChatEffortLevel = 'medium',
  provider: ChatProvider = 'claude',
  piProviderModel: string | undefined = undefined,
  codexModel: CodexChatModel = DEFAULT_CODEX_CHAT_MODEL,
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
  choice: null,
  model,
  effort,
  provider,
  codexModel,
  piProviderModel,
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
  | 'sessions' | 'activeSessionIds' | 'viewedSessionId' | 'model' | 'effort' | 'provider' | 'codexModel' | 'piProviderModel'
  | 'piProviders' | 'piProvidersAvailable' | 'piProvidersLoaded' | 'piAcknowledgedUnsafeProviders'
  | 'totalTokens' | 'sessionHistory' | 'slashCommands' | 'slashCommandsSource' | 'nextSessionNumber' | 'persistedProjectId'
> => ({
  sessions: new Map(),
  activeSessionIds: new Set(),
  viewedSessionId: null,
  model: 'sonnet',
  effort: 'medium',
  provider: 'claude',
  codexModel: DEFAULT_CODEX_CHAT_MODEL,
  piProviderModel: undefined,
  piProviders: [],
  piProvidersAvailable: false,
  piProvidersLoaded: false,
  piAcknowledgedUnsafeProviders: new Set(),
  totalTokens: 0,
  sessionHistory: [],
  slashCommands: [],
  slashCommandsSource: 'scan',
  nextSessionNumber: 1,
  persistedProjectId: null,
});
