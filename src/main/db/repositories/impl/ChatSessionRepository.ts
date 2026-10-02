/**
 * Chat Session Repository Implementation
 *
 * Stores each chat conversation's native provider session ID for resume.
 * Each chat_session_id (UI conversation grouping) maps to a provider_session_id.
 */

import type { Database, Statement } from 'better-sqlite3';
import type { ChatProvider, ChatSession, ChatTitleSource } from '../../../../shared/types';
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
  updateFocusDocumentAndClearProviderSession: Statement;
  updateProviderSessionId: Statement;
  updateModelChoice: Statement;
  updateTitle: Statement;
  clearProviderSessionIdsByProject: Statement;
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
        INSERT INTO chat_sessions (id, project_id, scope, provider)
        VALUES (?, ?, 'main', ?)
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
          provider,
          last_opened_at
        )
        VALUES (?, ?, 'focus_document', ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
      updateFocusDocumentAndClearProviderSession: db.prepare(`
        UPDATE chat_sessions
        SET focus_document_title = ?,
            focus_document_hash = ?,
            last_opened_at = CURRENT_TIMESTAMP,
            provider_session_id = NULL
        WHERE id = ?
        RETURNING *
      `),
      updateProviderSessionId: db.prepare(`
        UPDATE chat_sessions
        SET provider = ?,
            provider_session_id = ?
        WHERE id = ?
      `),
      updateModelChoice: db.prepare(`
        UPDATE chat_sessions
        SET chat_model_choice = ?,
            chat_model_choice_revision = chat_model_choice_revision + 1
        WHERE id = ? AND chat_model_choice_revision = ?
        RETURNING *
      `),
      updateTitle: db.prepare(`
        UPDATE chat_sessions
        SET title = ?, title_source = ?, title_turn = ?
        WHERE id = ?
      `),
      clearProviderSessionIdsByProject: db.prepare(`
        UPDATE chat_sessions
        SET provider_session_id = NULL
        WHERE project_id = ? AND provider_session_id IS NOT NULL
      `),
      delete: db.prepare('DELETE FROM chat_sessions WHERE id = ?'),
    };
  }

  create(id: string, projectId: string, provider: ChatProvider = 'claude'): ChatSession {
    return this.stmts.insert.get(id, projectId, provider) as ChatSession;
  }

  createFocusDocument(
    id: string,
    projectId: string,
    path: string,
    title: string,
    contentHash: string,
    provider: ChatProvider = 'claude',
  ): ChatSession {
    return this.stmts.insertFocusDocument.get(
      id,
      projectId,
      path,
      title,
      contentHash,
      provider,
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
    clearProviderSessionId: boolean,
  ): ChatSession {
    const stmt = clearProviderSessionId
      ? this.stmts.updateFocusDocumentAndClearProviderSession
      : this.stmts.updateFocusDocument;
    return stmt.get(title, contentHash, id) as ChatSession;
  }

  updateProviderSessionId(id: string, provider: ChatProvider, providerSessionId: string): void {
    this.stmts.updateProviderSessionId.run(provider, providerSessionId, id);
  }

  updateModelChoice(id: string, expectedRevision: number, choiceJson: string): ChatSession | undefined {
    return this.stmts.updateModelChoice.get(choiceJson, id, expectedRevision) as ChatSession | undefined;
  }

  updateTitle(id: string, title: string | null, source: ChatTitleSource | null, turn: number | null): void {
    this.stmts.updateTitle.run(title, source, turn, id);
  }

  clearProviderSessionIdsByProject(projectId: string): void {
    this.stmts.clearProviderSessionIdsByProject.run(projectId);
  }

  delete(id: string): void {
    this.stmts.delete.run(id);
  }
}
