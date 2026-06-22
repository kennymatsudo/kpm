export const CHAT_APPROVAL_MODE_KEY = 'chat_approval_mode';
export const CHAT_PROVIDER_KEY = 'chat_provider';

export const CHAT_APPROVAL_MODES = ['manual', 'auto_apply'] as const;
export type ChatApprovalMode = typeof CHAT_APPROVAL_MODES[number];
export const CHAT_PROVIDERS = ['claude', 'codex'] as const;
export type ChatProvider = typeof CHAT_PROVIDERS[number];

export const DEFAULT_CHAT_APPROVAL_MODE: ChatApprovalMode = 'manual';
export const DEFAULT_CHAT_PROVIDER: ChatProvider = 'claude';

export function parseChatApprovalMode(value: string | null | undefined): ChatApprovalMode {
  return value === 'auto_apply' ? 'auto_apply' : DEFAULT_CHAT_APPROVAL_MODE;
}

export function parseChatProvider(value: string | null | undefined): ChatProvider {
  return value === 'codex' ? 'codex' : DEFAULT_CHAT_PROVIDER;
}
