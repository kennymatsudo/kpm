/**
 * Chat Domain Repository Interfaces
 *
 * Interfaces for chat messages and chat sessions.
 */

import type {
  ChatMessage,
  ChatSession,
  ChatSessionSummary,
} from '../../../shared/types';

// =============================================================================
// Chat Message Repository
// =============================================================================

export interface IChatMessageRepository {
  getMessages(sessionId: string): ChatMessage[];
  getMessagesByChatSession(sessionId: string, chatSessionId: string): ChatMessage[];
  addMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    chatSessionId?: string,
  ): ChatMessage;
  getRecentSessions(sessionId: string, limit?: number): ChatSessionSummary[];
  /** Delete sessions beyond the keep limit (default 10), returns count deleted */
  pruneOldSessions(sessionId: string, keepCount?: number): number;
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
