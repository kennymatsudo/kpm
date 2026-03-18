/**
 * Type guards for Claude SDK message types.
 * Use these instead of type assertions (as) for runtime safety.
 */

import type {
  SDKMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKAPIRetryMessage,
} from '@anthropic-ai/claude-agent-sdk';

/**
 * Check if a message is an init system message (sent when SDK initializes).
 */
export function isInitMessage(msg: SDKMessage): msg is SDKSystemMessage & { subtype: 'init' } {
  return msg.type === 'system' && 'subtype' in msg && msg.subtype === 'init';
}

/**
 * Check if result was truncated due to max tokens.
 */
export function isMaxTokensReached(msg: SDKResultMessage): boolean {
  return 'stop_reason' in msg && msg.stop_reason === 'max_tokens';
}

/**
 * Check if result was truncated due to max turns limit.
 */
export function isMaxTurnsReached(msg: SDKResultMessage): boolean {
  return 'subtype' in msg && msg.subtype === 'error_max_turns';
}

/**
 * Check if a message is an API retry notification.
 * Emitted when an API request fails with a retryable error and will be retried.
 */
export function isApiRetryMessage(msg: SDKMessage): msg is SDKAPIRetryMessage {
  return msg.type === 'system' && 'subtype' in msg && msg.subtype === 'api_retry';
}
