import type { Database, Statement } from 'better-sqlite3';
import type { ITurnSnapshotRepository, TurnSnapshotRow } from '../../interfaces/diffReview';
import type { TurnFileChange } from '../../../../shared/diffReview';

interface RawRow {
  id: string;
  project_id: string;
  chat_session_id: string;
  client_message_id: string;
  root_path: string;
  store: 'repo' | 'shadow';
  before_tree: string;
  after_tree: string | null;
  files_json: string | null;
  error: string | null;
  created_at: string;
}

function parseFiles(json: string | null): TurnFileChange[] | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as TurnFileChange[]) : null;
  } catch {
    return null;
  }
}

function toRow(raw: RawRow): TurnSnapshotRow {
  return {
    id: raw.id,
    projectId: raw.project_id,
    chatSessionId: raw.chat_session_id,
    clientMessageId: raw.client_message_id,
    rootPath: raw.root_path,
    store: raw.store,
    beforeTree: raw.before_tree,
    afterTree: raw.after_tree,
    files: parseFiles(raw.files_json),
    error: raw.error,
    createdAt: raw.created_at,
  };
}

interface PreparedStatements {
  insertBefore: Statement;
  finish: Statement;
  fail: Statement;
  delete: Statement;
  listBySession: Statement;
  listByTurn: Statement;
}

/** One row per (chat, user message, root): the tree before a turn and, once it ends, the tree after. */
export class TurnSnapshotRepository implements ITurnSnapshotRepository {
  private stmts: PreparedStatements;

  constructor(db: Database) {
    this.stmts = {
      insertBefore: db.prepare(`
        INSERT INTO chat_turn_snapshots (id, project_id, chat_session_id, client_message_id, root_path, store, before_tree)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(chat_session_id, client_message_id, root_path)
        DO UPDATE SET before_tree = excluded.before_tree, after_tree = NULL, files_json = NULL, error = NULL, id = excluded.id
      `),
      finish: db.prepare('UPDATE chat_turn_snapshots SET after_tree = ?, files_json = ?, error = NULL WHERE id = ?'),
      fail: db.prepare('UPDATE chat_turn_snapshots SET error = ? WHERE id = ?'),
      delete: db.prepare('DELETE FROM chat_turn_snapshots WHERE id = ?'),
      listBySession: db.prepare('SELECT * FROM chat_turn_snapshots WHERE chat_session_id = ? ORDER BY created_at, rowid'),
      listByTurn: db.prepare(
        'SELECT * FROM chat_turn_snapshots WHERE chat_session_id = ? AND client_message_id = ? ORDER BY rowid',
      ),
    };
  }

  insertBefore(row: Parameters<ITurnSnapshotRepository['insertBefore']>[0]): void {
    this.stmts.insertBefore.run(
      row.id,
      row.projectId,
      row.chatSessionId,
      row.clientMessageId,
      row.rootPath,
      row.store,
      row.beforeTree,
    );
  }

  finish(id: string, afterTree: string, files: TurnFileChange[]): void {
    this.stmts.finish.run(afterTree, JSON.stringify(files), id);
  }

  fail(id: string, error: string): void {
    this.stmts.fail.run(error, id);
  }

  delete(id: string): void {
    this.stmts.delete.run(id);
  }

  listBySession(chatSessionId: string): TurnSnapshotRow[] {
    return (this.stmts.listBySession.all(chatSessionId) as RawRow[]).map(toRow);
  }

  listByTurn(chatSessionId: string, clientMessageId: string): TurnSnapshotRow[] {
    return (this.stmts.listByTurn.all(chatSessionId, clientMessageId) as RawRow[]).map(toRow);
  }
}
