import type { ChatChoiceEffort, ChatProvider } from './types';

export interface ProviderCapabilities {
  sessionSummaries: boolean;
  liveSlashCommands: boolean;
  /** Whether KPM chooses which MCP servers the provider starts with. */
  mcpServerManagement: boolean;
  /**
   * Whether a live session can report the MCP servers it actually connected to
   * (`IChatSession.mcp`). Independent of `mcpServerManagement`: Codex sessions
   * report servers KPM does not choose, and pi chat has servers it cannot yet
   * report.
   */
  mcpSessionInspection: boolean;
  midSessionModelSwitch: boolean;
  effortLevels: { levels: readonly ChatChoiceEffort[] };
  textDeltas: boolean;
  permissionPrompts: boolean;
  promptSuggestions: boolean;
  /**
   * Whether the provider can pause a running turn to ask for write
   * consent. False means the write fails first and the user is asked
   * afterwards, so the model has to retry on the next turn.
   */
  inTurnWriteApproval: boolean;
  /**
   * Whether the provider's shell keeps denying credential and secret paths after
   * the write grant is given. Claude runs its shell in an OS sandbox with those
   * roots denied for reads and writes; Codex's sandbox governs write scope only;
   * pi has no sandbox, and its tool-call gate cannot path-check a shell command
   * the way it checks a file tool, so after the grant its shell reads what the
   * user's own shell can. False is a real difference in blast radius, declared
   * here rather than discovered.
   */
  sandboxedShell: boolean;
  /**
   * Whether the provider reports work that keeps running after the turn that
   * started it ends. False means a finished turn really is the end of the
   * session's work, so the UI can treat `isStreaming` as the whole story.
   * Codex chat and pi both await their work rather than reporting detached tasks.
   */
  backgroundTaskReporting: boolean;
}

const CLAUDE_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const satisfies readonly ChatChoiceEffort[];

export const PROVIDER_CAPABILITIES = {
  claude: {
    sessionSummaries: true,
    liveSlashCommands: true,
    mcpServerManagement: true,
    mcpSessionInspection: true,
    midSessionModelSwitch: true,
    effortLevels: { levels: CLAUDE_EFFORT_LEVELS },
    textDeltas: true,
    permissionPrompts: true,
    promptSuggestions: true,
    inTurnWriteApproval: true,
    sandboxedShell: true,
    backgroundTaskReporting: true,
  },
  codex: {
    sessionSummaries: false,
    liveSlashCommands: false,
    // Codex starts the servers from its own config; KPM reports and reloads
    // them but never chooses which ones a session gets.
    mcpServerManagement: false,
    mcpSessionInspection: true,
    midSessionModelSwitch: false,
    effortLevels: { levels: [] },
    textDeltas: true,
    permissionPrompts: true,
    promptSuggestions: false,
    inTurnWriteApproval: true,
    sandboxedShell: true,
    backgroundTaskReporting: false,
  },
  pi: {
    sessionSummaries: false,
    liveSlashCommands: false,
    mcpServerManagement: false,
    mcpSessionInspection: false,
    midSessionModelSwitch: false,
    effortLevels: { levels: [] },
    textDeltas: true,
    permissionPrompts: true,
    promptSuggestions: false,
    inTurnWriteApproval: true,
    sandboxedShell: false,
    backgroundTaskReporting: false,
  },
} as const satisfies Record<ChatProvider, ProviderCapabilities>;

export function getProviderCapabilities(provider: ChatProvider): ProviderCapabilities {
  return PROVIDER_CAPABILITIES[provider];
}
