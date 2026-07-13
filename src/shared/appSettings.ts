export const CHAT_APPROVAL_MODES = ['manual', 'auto_apply'] as const;
export type ChatApprovalMode = typeof CHAT_APPROVAL_MODES[number];
export const CHAT_PROVIDERS = ['claude', 'codex', 'pi'] as const;
export type ChatProvider = typeof CHAT_PROVIDERS[number];

export const DEFAULT_CHAT_APPROVAL_MODE: ChatApprovalMode = 'manual';
export const DEFAULT_CHAT_PROVIDER: ChatProvider = 'claude';

/**
 * The provider the user has deliberately chosen, or null when none is stored.
 * Unlike the default-folding `chatProvider` codec, this does not fold "unset"
 * into a default — the null lets callers distinguish "no choice yet" from an
 * explicit `claude` pick, which readiness-driven resolution needs.
 */
export function getStoredChatProvider(value: string | null | undefined): ChatProvider | null {
  return value === 'claude' || value === 'codex' || value === 'pi' ? value : null;
}
