/**
 * Type guards for Claude SDK message types.
 * Use these instead of type assertions (as) for runtime safety.
 */

import type {
  SDKMessage,
  SDKResultMessage,
  SDKSystemMessage,
} from '@anthropic-ai/claude-agent-sdk';

/**
 * Check if a message is an init system message (sent when SDK initializes).
 */
export function isInitMessage(msg: SDKMessage): msg is SDKSystemMessage & { subtype: 'init' } {
  return msg.type === 'system' && 'subtype' in msg && msg.subtype === 'init';
}

