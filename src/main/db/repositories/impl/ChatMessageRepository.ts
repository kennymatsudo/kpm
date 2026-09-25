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
import type { ChatMessage, ChatProvider, ChatSessionLabel, ChatSessionSummary } from '../../../../shared/types';
import type { IChatMessageRepository } from '../../interfaces';

/**
 * Prepared statements cache for hot paths.
 */
interface PreparedStatements {
  getMessages: Statement;
  getMessagesByChatSession: Statement;
  getChatSessionIdsByClientMessageId: Statement;
  insert: Statement;
  insertOrIgnoreWithClientMessageId: Statement;
  getByClientMessageId: Statement;
  getRecentSessions: Statement;
  countAssistantMessages: Statement;
  pruneOldSessions: Statement;
}

export class ChatMessageRepository implements IChatMessageRepository {
  private stmts: PreparedStatements;

  constructor(private db: Database) {
    this.stmts = {
      getMessages: db.prepare(`
        SELECT m.* FROM chat_messages m
        LEFT JOIN chat_sessions s ON s.id = m.chat_session_id
        WHERE m.session_id = ?
          AND COALESCE(s.scope, 'main') = 'main'
        ORDER BY m.created_at ASC
      `),
      getMessagesByChatSession: db.prepare(`
        SELECT * FROM chat_messages
        WHERE session_id = ? AND chat_session_id = ?
        ORDER BY created_at ASC
      `),
      getChatSessionIdsByClientMessageId: db.prepare(`
        SELECT DISTINCT chat_session_id FROM chat_messages
        WHERE session_id = ? AND client_message_id = ? AND chat_session_id IS NOT NULL
      `),
      // Use RETURNING to get inserted row in one query
      insert: db.prepare(`
        INSERT INTO chat_messages (id, session_id, role, content, chat_session_id, provider, client_message_id, model)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `),
      insertOrIgnoreWithClientMessageId: db.prepare(`
        INSERT OR IGNORE INTO chat_messages (id, session_id, role, content, chat_session_id, provider, client_message_id, model)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `),
      getByClientMessageId: db.prepare(`
        SELECT * FROM chat_messages
        WHERE session_id = ? AND chat_session_id = ? AND client_message_id = ?
        LIMIT 1
      `),
      // Get distinct sessions with first user message, ordered by most recent.
      // LEFT JOIN chat_sessions for the SDK-derived title (null for legacy rows).
      getRecentSessions: db.prepare(`
        SELECT
          m.chat_session_id,
          COALESCE(s.provider, MIN(m.provider), 'claude') as provider,
          s.title as title,
          (
            SELECT SUBSTR(f.content, 1, 100) FROM chat_messages f
            WHERE f.session_id = m.session_id AND f.chat_session_id = m.chat_session_id AND f.role = 'user'
            ORDER BY f.created_at, f.rowid
            LIMIT 1
          ) as first_message,
          COUNT(*) as message_count,
          MIN(m.created_at) as created_at,
          MAX(m.created_at) as last_activity
        FROM chat_messages m
        LEFT JOIN chat_sessions s ON s.id = m.chat_session_id
        WHERE m.session_id = ?
          AND m.chat_session_id IS NOT NULL
          AND COALESCE(s.scope, 'main') = 'main'
        GROUP BY m.chat_session_id
        ORDER BY MAX(m.created_at) DESC
        LIMIT ?
      `),
      countAssistantMessages: db.prepare(`
        SELECT COUNT(*) AS count FROM chat_messages
        WHERE session_id = ? AND chat_session_id = ? AND role = 'assistant'
      `),
      // Delete every chat_session_id older than the N most recent, in a single
      // query. The subquery uses LIMIT -1 OFFSET ? to return only the sessions
      // we intend to drop — no need to materialize the full session list in JS.
      pruneOldSessions: db.prepare(`
        DELETE FROM chat_messages
        WHERE session_id = ?
          AND chat_session_id IN (
            SELECT m.chat_session_id FROM chat_messages m
            LEFT JOIN chat_sessions s ON s.id = m.chat_session_id
            WHERE m.session_id = ?
              AND m.chat_session_id IS NOT NULL
              AND COALESCE(s.scope, 'main') = 'main'
            GROUP BY m.chat_session_id
            ORDER BY MAX(m.created_at) DESC
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

  getChatSessionIdsByClientMessageId(sessionId: string, clientMessageId: string): string[] {
    const rows = this.stmts.getChatSessionIdsByClientMessageId.all(
      sessionId,
      clientMessageId,
    ) as { chat_session_id: string }[];
    return rows.map((row) => row.chat_session_id);
  }

  addMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    chatSessionId?: string,
    clientMessageId?: string,
    provider: ChatProvider = 'claude',
    model: string | null = null,
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
        provider,
        clientMessageId,
        model,
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
      provider,
      clientMessageId ?? null,
      model,
    ) as ChatMessage;
  }

  getRecentSessions(sessionId: string, limit = 5): ChatSessionSummary[] {
    return this.stmts.getRecentSessions.all(sessionId, limit) as ChatSessionSummary[];
  }

  countAssistantMessages(sessionId: string, chatSessionId: string): number {
    return (this.stmts.countAssistantMessages.get(sessionId, chatSessionId) as { count: number }).count;
  }

  getSessionLabels(sessionId: string, chatSessionIds: string[]): ChatSessionLabel[] {
    if (chatSessionIds.length === 0) return [];
    const placeholders = chatSessionIds.map(() => '?').join(', ');
    return this.db.prepare(`
      SELECT
        s.id AS chat_session_id,
        s.title AS title,
        (
          SELECT SUBSTR(f.content, 1, 100) FROM chat_messages f
          WHERE f.session_id = s.project_id AND f.chat_session_id = s.id AND f.role = 'user'
          ORDER BY f.created_at, f.rowid
          LIMIT 1
        ) AS first_message
      FROM chat_sessions s
      WHERE s.project_id = ? AND s.id IN (${placeholders})
    `).all(sessionId, ...chatSessionIds) as ChatSessionLabel[];
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
