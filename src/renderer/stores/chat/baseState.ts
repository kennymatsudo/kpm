import type { PerSessionState, ChatState } from './types';
import { DEFAULT_CODEX_CHAT_MODEL } from '../../../shared/types';
import { createIdleStreamingCluster } from './chatStreamReducer';

/** Create initial state for a new session */
export const createInitialPerSessionState = (sessionNumber: number): PerSessionState => ({
  messages: [],
  ...createIdleStreamingCluster(),
  // Deliberately outside the streaming cluster: background work outlives the
  // turn, so finalizing a turn must not clear it.
  backgroundTasks: [],
  error: null,
  sessionState: 'idle',
  draftMessage: '',
  pendingAttachments: [],
  suggestions: [],
  sessionNumber,
  choice: null,
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
  | 'sessions' | 'activeSessionIds' | 'viewedSessionId' | 'model' | 'provider' | 'codexModel' | 'piProviderModel'
  | 'piProviders' | 'piProvidersAvailable' | 'piProvidersLoaded' | 'piAcknowledgedUnsafeProviders'
  | 'totalTokens' | 'sessionHistory' | 'slashCommands' | 'slashCommandsSource' | 'nextSessionNumber' | 'persistedProjectId'
> => ({
  sessions: new Map(),
  activeSessionIds: new Set(),
  viewedSessionId: null,
  model: 'sonnet',
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
