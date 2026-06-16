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
  getFocusDocument: Statement;
  insert: Statement;
  insertFocusDocument: Statement;
  updateFocusDocument: Statement;
  updateFocusDocumentAndClearClaudeSession: Statement;
  updateClaudeSessionId: Statement;
  updateTitle: Statement;
  clearClaudeSessionIdsByProject: Statement;
  delete: Statement;
}

export class ChatSessionRepository implements IChatSessionRepository {
  private stmts: PreparedStatements;

  constructor(db: Database) {
    this.stmts = {
      getById: db.prepare('SELECT * FROM chat_sessions WHERE id = ?'),
      getFocusDocument: db.prepare(`
        SELECT * FROM chat_sessions
        WHERE project_id = ? AND scope = 'focus_document' AND focus_document_path = ?
        LIMIT 1
      `),
      insert: db.prepare(`
        RETURNING *
      `),
      insertFocusDocument: db.prepare(`
        INSERT INTO chat_sessions (
          id,
          project_id,
          scope,
          focus_document_path,
          focus_document_title,
          focus_document_hash,
          last_opened_at
        )
        RETURNING *
      `),
      updateFocusDocument: db.prepare(`
        UPDATE chat_sessions
        SET focus_document_title = ?,
            focus_document_hash = ?,
            last_opened_at = CURRENT_TIMESTAMP
        WHERE id = ?
        RETURNING *
      `),
      updateFocusDocumentAndClearClaudeSession: db.prepare(`
        UPDATE chat_sessions
        SET focus_document_title = ?,
            focus_document_hash = ?,
            last_opened_at = CURRENT_TIMESTAMP,
        WHERE id = ?
        RETURNING *
      `),
      updateClaudeSessionId: db.prepare(`
        UPDATE chat_sessions
        SET claude_session_id = ?
        WHERE id = ?
      `),
      updateTitle: db.prepare(`
        UPDATE chat_sessions
        SET title = ?
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

  createFocusDocument(
    id: string,
    projectId: string,
    path: string,
    title: string,
    contentHash: string,
  ): ChatSession {
    return this.stmts.insertFocusDocument.get(
      id,
      projectId,
      path,
      title,
      contentHash,
    ) as ChatSession;
  }

  get(id: string): ChatSession | undefined {
    return this.stmts.getById.get(id) as ChatSession | undefined;
  }

  getFocusDocument(projectId: string, path: string): ChatSession | undefined {
    return this.stmts.getFocusDocument.get(projectId, path) as ChatSession | undefined;
  }

  updateFocusDocument(
    id: string,
    title: string,
    contentHash: string,
    clearClaudeSessionId: boolean,
  ): ChatSession {
    const stmt = clearClaudeSessionId
      ? this.stmts.updateFocusDocumentAndClearClaudeSession
      : this.stmts.updateFocusDocument;
    return stmt.get(title, contentHash, id) as ChatSession;
  }

  updateClaudeSessionId(id: string, claudeSessionId: string): void {
    this.stmts.updateClaudeSessionId.run(claudeSessionId, id);
  }

  updateTitle(id: string, title: string): void {
    this.stmts.updateTitle.run(title, id);
  }

  clearClaudeSessionIdsByProject(projectId: string): void {
    this.stmts.clearClaudeSessionIdsByProject.run(projectId);
  }

  delete(id: string): void {
    this.stmts.delete.run(id);
  }
}
