import type { ChatAttachment, ChatProvider } from './types';

export interface ProviderCapabilities {
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
  promptSuggestions: boolean;
  /**
   * Attachment kinds the provider's turn input can carry. Codex app-server and
   * pi's prompt API take images but have no document input, so a PDF would
   * reach the model as nothing at all.
   */
  attachmentKinds: readonly ChatAttachment['kind'][];
}

export const PROVIDER_CAPABILITIES = {
  claude: {
    liveSlashCommands: true,
    mcpServerManagement: true,
    mcpSessionInspection: true,
    promptSuggestions: true,
    attachmentKinds: ['image', 'pdf', 'text'],
  },
  codex: {
    liveSlashCommands: false,
    // Codex starts the servers from its own config; KPM reports and reloads
    // them but never chooses which ones a session gets.
    mcpServerManagement: false,
    mcpSessionInspection: true,
    promptSuggestions: false,
    attachmentKinds: ['image', 'text'],
  },
  pi: {
    liveSlashCommands: false,
    mcpServerManagement: false,
    mcpSessionInspection: false,
    promptSuggestions: false,
    attachmentKinds: ['image', 'text'],
  },
} as const satisfies Record<ChatProvider, ProviderCapabilities>;

export function getProviderCapabilities(provider: ChatProvider): ProviderCapabilities {
  return PROVIDER_CAPABILITIES[provider];
}

const ATTACHMENT_KIND_LABELS: Record<ChatAttachment['kind'], string> = {
  image: 'images',
  pdf: 'PDFs',
  text: 'text files',
};

const PROVIDER_LABELS: Record<ChatProvider, string> = { claude: 'Claude', codex: 'Codex', pi: 'pi' };

/** Why `provider` can't take these attachments, or null when it can take them all. */
export function unsupportedAttachmentError(
  provider: ChatProvider,
  attachments: readonly Pick<ChatAttachment, 'kind' | 'filename'>[],
): string | null {
  const supported = PROVIDER_CAPABILITIES[provider].attachmentKinds as readonly ChatAttachment['kind'][];
  const rejected = attachments.find((attachment) => !supported.includes(attachment.kind));
  if (!rejected) return null;
  return `${PROVIDER_LABELS[provider]} can't read ${ATTACHMENT_KIND_LABELS[rejected.kind]}. Remove "${rejected.filename}" to send.`;
}
