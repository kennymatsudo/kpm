/**
 * Chat Session Repository Implementation
 *
 * Stores Claude SDK session IDs per chat conversation for proper resume functionality.
 * Each chat_session_id (UI conversation grouping) maps to a claude_session_id (SDK session).
 */

import type { Database, Statement } from 'better-sqlite3';
import type { IChatSessionRepository } from '../../interfaces';

/**
 * Prepared statements cache for hot paths.
 */
interface PreparedStatements {
  getById: Statement;
  insert: Statement;
  updateClaudeSessionId: Statement;
  clearClaudeSessionIdsByProject: Statement;
  delete: Statement;
}

export class ChatSessionRepository implements IChatSessionRepository {
  private stmts: PreparedStatements;

  constructor(db: Database) {
    this.stmts = {
      getById: db.prepare('SELECT * FROM chat_sessions WHERE id = ?'),
      insert: db.prepare(`
        RETURNING *
      `),
      updateClaudeSessionId: db.prepare(`
        UPDATE chat_sessions
        SET claude_session_id = ?
        WHERE id = ?
      `),
      clearClaudeSessionIdsByProject: db.prepare(`
        UPDATE chat_sessions
        SET claude_session_id = NULL
        WHERE project_id = ? AND claude_session_id IS NOT NULL
      `),
      delete: db.prepare('DELETE FROM chat_sessions WHERE id = ?'),
    };
  }

  }

  get(id: string): ChatSession | undefined {
    return this.stmts.getById.get(id) as ChatSession | undefined;
  }

  updateClaudeSessionId(id: string, claudeSessionId: string): void {
    this.stmts.updateClaudeSessionId.run(claudeSessionId, id);
  }

  clearClaudeSessionIdsByProject(projectId: string): void {
    this.stmts.clearClaudeSessionIdsByProject.run(projectId);
  }

  delete(id: string): void {
    this.stmts.delete.run(id);
  }
}
