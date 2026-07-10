export const CHAT_APPROVAL_MODE_KEY = 'chat_approval_mode';
export const CHAT_PROVIDER_KEY = 'chat_provider';
/** Set once the user has seen the connect-agent step, so it auto-opens only on first run. */
export const CONNECT_PROMPT_SEEN_KEY = 'connect_prompt_seen';

export const CHAT_APPROVAL_MODES = ['manual', 'auto_apply'] as const;
export type ChatApprovalMode = typeof CHAT_APPROVAL_MODES[number];
export const CHAT_PROVIDERS = ['claude', 'codex', 'pi'] as const;
export type ChatProvider = typeof CHAT_PROVIDERS[number];

export const DEFAULT_CHAT_APPROVAL_MODE: ChatApprovalMode = 'manual';
export const DEFAULT_CHAT_PROVIDER: ChatProvider = 'claude';

export function parseChatApprovalMode(value: string | null | undefined): ChatApprovalMode {
  return value === 'auto_apply' ? 'auto_apply' : DEFAULT_CHAT_APPROVAL_MODE;
}

export function parseChatProvider(value: string | null | undefined): ChatProvider {
  return value === 'codex' || value === 'pi' ? value : DEFAULT_CHAT_PROVIDER;
}

/**
 * The provider the user has deliberately chosen, or null when none is stored.
 * Unlike `parseChatProvider`, this does not fold "unset" into a default — the
 * null lets callers distinguish "no choice yet" from an explicit `claude` pick,
 * which readiness-driven resolution needs.
 */
export function getStoredChatProvider(value: string | null | undefined): ChatProvider | null {
  return value === 'claude' || value === 'codex' || value === 'pi' ? value : null;
}
