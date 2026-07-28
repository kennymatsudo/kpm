import type { ChatEffortLevel, ChatProvider } from './types';

export interface ProviderCapabilities {
  sessionSummaries: boolean;
  liveSlashCommands: boolean;
  mcpServerManagement: boolean;
  midSessionModelSwitch: boolean;
  effortLevels: { levels: readonly ChatEffortLevel[] };
  textDeltas: boolean;
  permissionPrompts: boolean;
  promptSuggestions: boolean;
  /**
   * Whether the provider can pause a running turn to ask for write
   * consent. False means the write fails first and the user is asked
   * afterwards, so the model has to retry on the next turn — Codex's SDK is a
   * one-shot `codex exec` wrapper with no approval channel, so its sandbox
   * decision is fixed when the thread starts.
   */
  inTurnWriteApproval: boolean;
}

const CLAUDE_EFFORT_LEVELS = ['low', 'medium', 'high', 'max'] as const satisfies readonly ChatEffortLevel[];

export const PROVIDER_CAPABILITIES = {
  claude: {
    sessionSummaries: true,
    liveSlashCommands: true,
    mcpServerManagement: true,
    midSessionModelSwitch: true,
    effortLevels: { levels: CLAUDE_EFFORT_LEVELS },
    textDeltas: true,
    permissionPrompts: true,
    promptSuggestions: true,
    inTurnWriteApproval: true,
  },
  codex: {
    sessionSummaries: false,
    liveSlashCommands: false,
    mcpServerManagement: false,
    midSessionModelSwitch: false,
    effortLevels: { levels: [] },
    textDeltas: true,
    permissionPrompts: false,
    promptSuggestions: false,
    inTurnWriteApproval: false,
  },
  pi: {
    sessionSummaries: false,
    liveSlashCommands: false,
    mcpServerManagement: false,
    midSessionModelSwitch: false,
    effortLevels: { levels: [] },
    textDeltas: true,
    permissionPrompts: true,
    promptSuggestions: false,
    inTurnWriteApproval: true,
  },
} as const satisfies Record<ChatProvider, ProviderCapabilities>;

export function getProviderCapabilities(provider: ChatProvider): ProviderCapabilities {
  return PROVIDER_CAPABILITIES[provider];
}
