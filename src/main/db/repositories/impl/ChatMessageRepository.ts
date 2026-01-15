/**
 * Chat Message Repository Implementation
 *
 * Unified message storage for main project chat sessions.
 * Enables session recovery after app restart or crash.
 *
 * Optimized with prepared statement caching.
 */

import type { Database, Statement } from 'better-sqlite3';
import type { IChatMessageRepository } from '../../interfaces';

/**
 * Prepared statements cache for hot paths.
 */
interface PreparedStatements {
  getMessages: Statement;
  getMessagesByChatSession: Statement;
  insert: Statement;
  getRecentSessions: Statement;
}

export class ChatMessageRepository implements IChatMessageRepository {
  private stmts: PreparedStatements;

  constructor(private db: Database) {
    this.stmts = {
      getMessages: db.prepare(`
      `),
      getMessagesByChatSession: db.prepare(`
        SELECT * FROM chat_messages
        WHERE session_id = ? AND chat_session_id = ?
        ORDER BY created_at ASC
      `),
      // Use RETURNING to get inserted row in one query
      insert: db.prepare(`
        RETURNING *
      `),
      getRecentSessions: db.prepare(`
        SELECT
          COUNT(*) as message_count,
        LIMIT ?
      `),
    };
  }

  getMessages(sessionId: string): ChatMessage[] {
    return this.stmts.getMessages.all(sessionId) as ChatMessage[];
  }

  getMessagesByChatSession(sessionId: string, chatSessionId: string): ChatMessage[] {
    return this.stmts.getMessagesByChatSession.all(sessionId, chatSessionId) as ChatMessage[];
  }

  addMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
  ): ChatMessage {
    // Use RETURNING to get inserted row in one query
  }

    return this.stmts.getRecentSessions.all(sessionId, limit) as ChatSessionSummary[];
  }

  /**
   * Delete old sessions beyond the keep limit to prevent unbounded database growth.
   * Keeps the N most recent sessions and deletes all messages from older ones.
   */
    return result.changes;
  }
}
