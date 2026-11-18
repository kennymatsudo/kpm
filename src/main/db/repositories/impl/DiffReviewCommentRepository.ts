import type { Database, Statement } from 'better-sqlite3';
import type { IDiffReviewCommentRepository } from '../../interfaces/diffReview';
import type { DiffReviewComment, DiffSide, NewDiffReviewComment } from '../../../../shared/diffReview';

interface RawRow {
  id: string;
  project_id: string;
  chat_session_id: string;
  root_path: string;
  file_path: string;
  side: DiffSide;
  start_line: number;
  end_line: number;
  quoted_text: string;
  body: string;
  created_at: string;
}

function toComment(raw: RawRow): DiffReviewComment {
  return {
    id: raw.id,
    projectId: raw.project_id,
    chatSessionId: raw.chat_session_id,
    rootPath: raw.root_path,
    filePath: raw.file_path,
    side: raw.side,
    startLine: raw.start_line,
    endLine: raw.end_line,
    quotedText: raw.quoted_text,
    body: raw.body,
    createdAt: raw.created_at,
  };
}

interface PreparedStatements {
  insert: Statement;
  update: Statement;
  delete: Statement;
  listBySession: Statement;
}

/** Line comments the user leaves on a diff, kept until they are sent with a chat message. */
export class DiffReviewCommentRepository implements IDiffReviewCommentRepository {
  private stmts: PreparedStatements;

  constructor(private readonly db: Database) {
    this.stmts = {
      insert: db.prepare(`
        INSERT INTO diff_review_comments
          (id, project_id, chat_session_id, root_path, file_path, side, start_line, end_line, quoted_text, body)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      update: db.prepare(`
        UPDATE diff_review_comments SET
          body = COALESCE(?, body),
          start_line = COALESCE(?, start_line),
          end_line = COALESCE(?, end_line),
          quoted_text = COALESCE(?, quoted_text)
        WHERE id = ?
      `),
      delete: db.prepare('DELETE FROM diff_review_comments WHERE id = ?'),
      listBySession: db.prepare('SELECT * FROM diff_review_comments WHERE chat_session_id = ? ORDER BY created_at, rowid'),
    };
  }

  create(comment: NewDiffReviewComment & { id: string }): DiffReviewComment {
    this.stmts.insert.run(
      comment.id,
      comment.projectId,
      comment.chatSessionId,
      comment.rootPath,
      comment.filePath,
      comment.side,
      comment.startLine,
      comment.endLine,
      comment.quotedText,
      comment.body,
    );
    return this.getMany([comment.id])[0];
  }

  update(
    id: string,
    changes: { body?: string; startLine?: number; endLine?: number; quotedText?: string },
  ): DiffReviewComment | undefined {
    this.stmts.update.run(
      changes.body ?? null,
      changes.startLine ?? null,
      changes.endLine ?? null,
      changes.quotedText ?? null,
      id,
    );
    return this.getMany([id])[0];
  }

  delete(id: string): void {
    this.stmts.delete.run(id);
  }

  deleteMany(ids: string[]): void {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(', ');
    this.db.prepare(`DELETE FROM diff_review_comments WHERE id IN (${placeholders})`).run(...ids);
  }

  listBySession(chatSessionId: string): DiffReviewComment[] {
    return (this.stmts.listBySession.all(chatSessionId) as RawRow[]).map(toComment);
  }

  getMany(ids: string[]): DiffReviewComment[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.db
      .prepare(`SELECT * FROM diff_review_comments WHERE id IN (${placeholders}) ORDER BY created_at, rowid`)
      .all(...ids) as RawRow[];
    return rows.map(toComment);
  }
}
