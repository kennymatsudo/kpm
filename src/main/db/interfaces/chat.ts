/**
 * Chat Domain Repository Interfaces
 *
 * Interfaces for chat messages and chat sessions.
 */

import type {
  ChatProvider,
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
    clientMessageId?: string,
    provider?: ChatProvider,
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
  create(id: string, projectId: string, provider?: ChatProvider): ChatSession;
  /** Create a focus-document chat session with a specific ID. */
  createFocusDocument(
    id: string,
    projectId: string,
    path: string,
    title: string,
    contentHash: string,
    provider?: ChatProvider,
  ): ChatSession;
  /** Get a chat session by ID */
  get(id: string): ChatSession | undefined;
  /** Get the persisted focus-document chat session for a project file path. */
  getFocusDocument(projectId: string, path: string): ChatSession | undefined;
  /** Update focus-document metadata after opening the reader. */
  updateFocusDocument(
    id: string,
    title: string,
    contentHash: string,
    clearClaudeSessionId: boolean,
  ): ChatSession;
  /** Update the Claude SDK session ID for resume functionality */
  updateClaudeSessionId(id: string, claudeSessionId: string): void;
  /** Update the native provider session/thread ID for resume functionality. */
  updateProviderSessionId(id: string, provider: ChatProvider, providerSessionId: string): void;
  /** Update the SDK-derived display title (auto-summary or user-renamed). */
  updateTitle(id: string, title: string): void;
  /**
   * Null out claude_session_id for every chat session in a project.
   * Forces the next send to spawn a fresh SDK session instead of resuming
   * one whose cwd was baked in at spawn time (e.g. after a worktree switch).
   */
  clearClaudeSessionIdsByProject(projectId: string): void;
  /** Null out native provider session IDs for every chat session in a project. */
  clearProviderSessionIdsByProject(projectId: string): void;
  /** Delete a chat session */
  delete(id: string): void;
}
