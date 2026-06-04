export const CHAT_APPROVAL_MODE_KEY = 'chat_approval_mode';

export const CHAT_APPROVAL_MODES = ['manual', 'auto_apply'] as const;
export type ChatApprovalMode = typeof CHAT_APPROVAL_MODES[number];

export const DEFAULT_CHAT_APPROVAL_MODE: ChatApprovalMode = 'manual';

export function parseChatApprovalMode(value: string | null | undefined): ChatApprovalMode {
  return value === 'auto_apply' ? 'auto_apply' : DEFAULT_CHAT_APPROVAL_MODE;
}
