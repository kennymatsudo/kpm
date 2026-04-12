/**
 * Type guards for Claude SDK message types.
 * Use these instead of type assertions (as) for runtime safety.
 */

import type {
  SDKMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKAPIRetryMessage,
  SDKSessionStateChangedMessage,
  SDKRateLimitEvent,
  SDKRateLimitInfo,
  TerminalReason,
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
 * Uses terminal_reason when available (v0.2.91+), falls back to subtype.
 */
export function isMaxTurnsReached(msg: SDKResultMessage): boolean {
  if ('terminal_reason' in msg && msg.terminal_reason) {
    return msg.terminal_reason === 'max_turns';
  }
  return 'subtype' in msg && msg.subtype === 'error_max_turns';
}

/**
 * Extract the terminal_reason from a result message (v0.2.91+).
 * Returns undefined for older SDK versions or if not present.
 */
export function getTerminalReason(msg: SDKResultMessage): TerminalReason | undefined {
  return 'terminal_reason' in msg ? msg.terminal_reason : undefined;
}

/**
 * Check if a message is an API retry notification.
 * Emitted when an API request fails with a retryable error and will be retried.
 */
export function isApiRetryMessage(msg: SDKMessage): msg is SDKAPIRetryMessage {
  return msg.type === 'system' && 'subtype' in msg && msg.subtype === 'api_retry';
}

/**
 * Check if a message is a session state change notification.
 * Emitted when the session transitions between idle, running, or requires_action.
 */
export function isSessionStateChanged(msg: SDKMessage): msg is SDKSessionStateChangedMessage {
  return msg.type === 'system' && 'subtype' in msg && msg.subtype === 'session_state_changed';
}

/**
 * Check if a message is a rate limit event.
 * Emitted when rate limit info changes (warning, rejection, etc.).
 */
export function isRateLimitEvent(msg: SDKMessage): msg is SDKRateLimitEvent {
  return msg.type === 'rate_limit_event';
}
