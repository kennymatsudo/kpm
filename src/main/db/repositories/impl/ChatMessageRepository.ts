/**
 * Chat Message Repository Implementation
 *
 * Unified message storage for main project chat sessions.
 * Enables session recovery after app restart or crash.
 *
 * Optimized with prepared statement caching.
 */

import type { Database, Statement } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { IChatMessageRepository } from '../../interfaces';

/**
 * Prepared statements cache for hot paths.
 */
interface PreparedStatements {
  getMessages: Statement;
  getMessagesByChatSession: Statement;
  insert: Statement;
  insertOrIgnoreWithClientMessageId: Statement;
  getByClientMessageId: Statement;
  getRecentSessions: Statement;
  pruneOldSessions: Statement;
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
        INSERT INTO chat_messages (id, session_id, role, content, chat_session_id, provider, client_message_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `),
      insertOrIgnoreWithClientMessageId: db.prepare(`
        INSERT OR IGNORE INTO chat_messages (id, session_id, role, content, chat_session_id, provider, client_message_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `),
      getByClientMessageId: db.prepare(`
        SELECT * FROM chat_messages
        WHERE session_id = ? AND chat_session_id = ? AND client_message_id = ?
        LIMIT 1
      `),
      getRecentSessions: db.prepare(`
        SELECT
          COUNT(*) as message_count,
        LIMIT ?
      `),
      // Delete every chat_session_id older than the N most recent, in a single
      // query. The subquery uses LIMIT -1 OFFSET ? to return only the sessions
      // we intend to drop — no need to materialize the full session list in JS.
      pruneOldSessions: db.prepare(`
        DELETE FROM chat_messages
        WHERE session_id = ?
          AND chat_session_id IN (
            LIMIT -1 OFFSET ?
          )
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
    chatSessionId?: string,
  ): ChatMessage {
    if (clientMessageId && chatSessionId) {
      const existing = this.stmts.getByClientMessageId.get(
        sessionId,
        chatSessionId,
        clientMessageId
      ) as ChatMessage | undefined;
      if (existing) {
        return existing;
      }

      const id = randomUUID();
      const inserted = this.stmts.insertOrIgnoreWithClientMessageId.get(
        id,
        sessionId,
        role,
        content,
        chatSessionId,
        clientMessageId
      ) as ChatMessage | undefined;
      if (inserted) {
        return inserted;
      }
    }

    const id = randomUUID();
    // Use RETURNING to get inserted row in one query
    return this.stmts.insert.get(
      id,
      sessionId,
      role,
      content,
      chatSessionId ?? null,
      clientMessageId ?? null
    ) as ChatMessage;
  }

  getRecentSessions(sessionId: string, limit = 5): ChatSessionSummary[] {
    return this.stmts.getRecentSessions.all(sessionId, limit) as ChatSessionSummary[];
  }

  /**
   * Delete old sessions beyond the keep limit to prevent unbounded database growth.
   * Keeps the N most recent sessions and deletes all messages from older ones.
   * One cached DELETE...IN (SELECT) query — no full session list in memory and
   * no inline prepare on the hot path.
   */
  pruneOldSessions(sessionId: string, keepCount = 10): number {
    const result = this.stmts.pruneOldSessions.run(sessionId, sessionId, keepCount);
    return result.changes;
  }
}
