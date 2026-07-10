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
  },
  pi: {
    sessionSummaries: false,
    liveSlashCommands: false,
    mcpServerManagement: false,
    midSessionModelSwitch: false,
    effortLevels: { levels: [] },
    textDeltas: true,
    permissionPrompts: false,
    promptSuggestions: false,
  },
} as const satisfies Record<ChatProvider, ProviderCapabilities>;

export function getProviderCapabilities(provider: ChatProvider): ProviderCapabilities {
  return PROVIDER_CAPABILITIES[provider];
}
