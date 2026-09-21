import { describe, expect, it } from 'vitest';
import type { Database } from 'better-sqlite3';
import { createTestDb } from '../../testing/createTestDb';
import { ChatMessageRepository } from './ChatMessageRepository';
import { ChatSessionRepository } from './ChatSessionRepository';

// chat_sessions.project_id is a real FK (ON DELETE CASCADE) in the shipped
// schema, so a session row needs a project to point at.
function seedProject(db: Database, id: string): void {
  db.prepare('INSERT INTO projects (id, name, folder_path) VALUES (?, ?, ?)').run(id, 'Test project', `/tmp/${id}`);
}

describe('Chat repositories model-choice persistence', () => {
  it('persists the aggregate exactly and enforces its expected revision', () => {
    const db = createTestDb();
    try {
      seedProject(db, 'p1');
      const sessions = new ChatSessionRepository(db);
      sessions.create('c1', 'p1');
      const json = JSON.stringify({ version: 1, selectedProvider: 'claude', remembered: { claude: { model: 'sonnet', effort: 'medium' } } });
      expect(sessions.updateModelChoice('c1', 0, json)).toMatchObject({
        chat_model_choice: json,
        chat_model_choice_revision: 1,
      });
      expect(sessions.updateModelChoice('c1', 0, '{}')).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it('stores concrete assistant model attribution while allowing null', () => {
    const db = createTestDb();
    try {
      const messages = new ChatMessageRepository(db);
      expect(messages.addMessage('p1', 'assistant', 'new', 'c1', undefined, 'codex', 'gpt-5.6-sol').model).toBe('gpt-5.6-sol');
      expect(messages.addMessage('p1', 'assistant', 'legacy', 'c1', undefined, 'claude').model).toBeNull();
    } finally {
      db.close();
    }
  });

  it('finds every chat session that persisted a client message ID', () => {
    const db = createTestDb();
    try {
      const messages = new ChatMessageRepository(db);
      messages.addMessage('p1', 'user', 'first', 'c1', 'client-1');
      messages.addMessage('p1', 'user', 'crossed retry', 'c2', 'client-1');
      messages.addMessage('p2', 'user', 'other project', 'c3', 'client-1');

      expect(messages.getChatSessionIdsByClientMessageId('p1', 'client-1')).toEqual(['c1', 'c2']);
      expect(messages.getChatSessionIdsByClientMessageId('p2', 'client-1')).toEqual(['c3']);
    } finally {
      db.close();
    }
  });
});
