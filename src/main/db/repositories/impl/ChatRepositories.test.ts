import { describe, expect, it } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { ChatMessageRepository } from './ChatMessageRepository';
import { ChatSessionRepository } from './ChatSessionRepository';

function database() {
  const db = new BetterSqlite3(':memory:');
  db.exec(`
    CREATE TABLE chat_sessions (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, claude_session_id TEXT,
      provider TEXT NOT NULL DEFAULT 'claude', provider_session_id TEXT,
      scope TEXT NOT NULL DEFAULT 'main', focus_document_path TEXT,
      focus_document_title TEXT, focus_document_hash TEXT, last_opened_at TEXT,
      title TEXT, chat_model_choice TEXT, chat_model_choice_revision INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE chat_messages (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, chat_session_id TEXT,
      client_message_id TEXT, provider TEXT NOT NULL, model TEXT,
      role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX idx_test_client ON chat_messages(chat_session_id, client_message_id)
      WHERE client_message_id IS NOT NULL;
  `);
  return db;
}

describe('Chat repositories model-choice persistence', () => {
  it('persists the aggregate exactly and enforces its expected revision', () => {
    const db = database();
    const sessions = new ChatSessionRepository(db);
    sessions.create('c1', 'p1');
    const json = JSON.stringify({ version: 1, selectedProvider: 'claude', remembered: { claude: { model: 'sonnet', effort: 'medium' } } });
    expect(sessions.updateModelChoice('c1', 0, json)).toMatchObject({
      chat_model_choice: json,
      chat_model_choice_revision: 1,
    });
    expect(sessions.updateModelChoice('c1', 0, '{}')).toBeUndefined();
    db.close();
  });

  it('stores concrete assistant model attribution while allowing null', () => {
    const db = database();
    const messages = new ChatMessageRepository(db);
    expect(messages.addMessage('p1', 'assistant', 'new', 'c1', undefined, 'codex', 'gpt-5.6-sol').model).toBe('gpt-5.6-sol');
    expect(messages.addMessage('p1', 'assistant', 'legacy', 'c1', undefined, 'claude').model).toBeNull();
    db.close();
  });
});
