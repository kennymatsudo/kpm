/**
 * Chat Domain Repository Interfaces
 *
 */

import type {
  ChatMessage,
  ChatSession,
  ChatSessionSummary,
} from '../../../shared/types';

// =============================================================================
// =============================================================================

export interface IChatMessageRepository {
  /** Delete sessions beyond the keep limit (default 10), returns count deleted */
}

// =============================================================================
// Chat Session Repository
// =============================================================================

export interface IChatSessionRepository {
  /** Create a new chat session with a specific ID (called when starting a new conversation) */
  /** Get a chat session by ID */
  get(id: string): ChatSession | undefined;
  /** Update the Claude SDK session ID for resume functionality */
  updateClaudeSessionId(id: string, claudeSessionId: string): void;
  /** Delete a chat session */
  delete(id: string): void;
}
