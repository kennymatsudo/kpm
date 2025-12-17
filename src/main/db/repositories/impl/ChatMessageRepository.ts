/**
 * Chat Message Repository Implementation
 *
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
  insert: Statement;
}

export class ChatMessageRepository implements IChatMessageRepository {
  private stmts: PreparedStatements;

  constructor(private db: Database) {
    this.stmts = {
      getMessages: db.prepare(`
      `),
      // Use RETURNING to get inserted row in one query
      insert: db.prepare(`
        RETURNING *
      `),
    };
  }

  }

  addMessage(
    sessionId: string,
    role: 'user' | 'assistant',
  ): ChatMessage {
    // Use RETURNING to get inserted row in one query
  }

}
