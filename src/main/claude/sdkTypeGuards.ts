/**
 * Type guards for Claude SDK message types.
 * Use these instead of type assertions (as) for runtime safety.
 */

import type {
  SDKMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKAPIRetryMessage,
  SDKCommandsChangedMessage,
  SDKSessionStateChangedMessage,
  SDKRateLimitEvent,
  SDKRateLimitInfo,
  SDKPermissionDeniedMessage,
  SDKToolUseSummaryMessage,
  SDKToolProgressMessage,
  SDKAssistantMessageError,
  TerminalReason,
} from '@anthropic-ai/claude-agent-sdk';


/**
 * Check if a message is an init system message (sent when SDK initializes).
 */
export function isInitMessage(msg: SDKMessage): msg is SDKSystemMessage & { subtype: 'init' } {
  return msg.type === 'system' && 'subtype' in msg && msg.subtype === 'init';
}

/**
 * Check if a message is a mid-session slash-command list update.
 * Clients should replace their cached command list with the payload.
 */
export function isCommandsChangedMessage(msg: SDKMessage): msg is SDKCommandsChangedMessage {
  return msg.type === 'system' && 'subtype' in msg && msg.subtype === 'commands_changed';
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

/**
 * Check if a message is a permission denied notification (SDK v0.3.144+).
 * Emitted when canUseTool denies a tool call. Carries tool_name, tool_use_id,
 * and optionally agent_id (if the denial originated inside a subagent).
 */
export function isPermissionDeniedMessage(msg: SDKMessage): msg is SDKPermissionDeniedMessage {
  return msg.type === 'system' && 'subtype' in msg && msg.subtype === 'permission_denied';
}

/**
 * Check if a message is a tool-use summary (SDK v0.3.144+).
 * Emitted after a batch of tool calls to summarise what ran. Carries a
 * human-readable summary string and the IDs of the tool calls it covers.
 */
export function isToolUseSummary(msg: SDKMessage): msg is SDKToolUseSummaryMessage {
  return msg.type === 'tool_use_summary';
}

/**
 * Check if a message is a tool-progress heartbeat. Emitted periodically for a
 * still-running tool, carrying `tool_use_id`, `tool_name`, and
 * `elapsed_time_seconds` — lets the UI show a live timer on long calls.
 */
export function isToolProgressMessage(msg: SDKMessage): msg is SDKToolProgressMessage {
  return msg.type === 'tool_progress';
}

/**
 * Map an assistant-message `error` category to a human-readable, actionable
 * message for the chat UI. An assistant message carries this field when the
 * turn aborts on an API/model failure (e.g. `overloaded` → HTTP 529 added in
 * SDK v0.3.161); without surfacing it the turn just stops with no explanation.
 *
 * Returns `undefined` for categories that already have dedicated handling so we
 * don't double-surface: `authentication_failed` is caught by the auth-teardown
 * path, and `max_output_tokens` by the result max-tokens path.
 */
export function describeAssistantError(error: SDKAssistantMessageError): string | undefined {
  switch (error) {
    case 'overloaded':
      return 'Claude is temporarily overloaded. Wait a moment, then send another message to retry.';
    case 'server_error':
      return 'Claude had a server error. Wait a moment, then send another message to retry.';
    case 'rate_limit':
      return 'Rate limited. Wait a moment, then send another message to continue.';
    case 'billing_error':
      return 'A billing error occurred. Check your Claude plan or billing settings, then retry.';
    case 'model_not_found':
      return 'The selected model is unavailable. Switch models in the chat header and retry.';
    case 'invalid_request':
      return 'The request was invalid and could not be processed.';
    case 'oauth_org_not_allowed':
      return 'Your organization is not permitted to use this Claude Code session.';
    case 'unknown':
      return 'The response stopped due to an unexpected error. Send another message to retry.';
    case 'authentication_failed':
    case 'max_output_tokens':
      // Handled by dedicated paths in StreamingSessionService (auth teardown /
      // result max-tokens). Returning undefined avoids a duplicate banner.
      return undefined;
    default:
      // Forward-compat: a future SDK error category we don't map yet.
      return 'The response stopped due to an error. Send another message to retry.';
  }
}
