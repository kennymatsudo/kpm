/**
 * ReviewTask Repository Implementation
 *
 * Persists actionable GitHub review-thread workflow records.
 */

import { randomUUID } from 'crypto';
import type { Database, Statement } from 'better-sqlite3';
import type { ReviewTask } from '../../../../shared/types';
import type {
  IReviewTaskRepository,
  ReviewTaskStatusUpdate,
  ReviewTaskUpsert,
} from '../../interfaces';

interface PreparedStatements {
  getById: Statement;
  getByRepoPr: Statement;
  upsert: Statement;
  markResolvedByThread: Statement;
}

export class ReviewTaskRepository implements IReviewTaskRepository {
  private readonly db: Database;
  private readonly stmts: PreparedStatements;

  constructor(db: Database) {
    this.db = db;
    this.stmts = {
      getById: db.prepare('SELECT * FROM review_tasks WHERE id = ?'),
      getByRepoPr: db.prepare(`
        SELECT * FROM review_tasks
        WHERE repo_id = ? AND pr_number = ?
        ORDER BY updated_at DESC, created_at DESC
      `),
      upsert: db.prepare(`
        INSERT INTO review_tasks (
          id, project_id, repo_id, session_id, pr_number, thread_id, thread_url,
          path, line, source, status, internal_state, disposition, rationale, draft_reply,
          priority, title, latest_comment_preview,
          last_seen_comment_id, last_seen_updated_at, last_agent_run_at,
          last_posted_reply_id, error, completed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(repo_id, pr_number, thread_id) DO UPDATE SET
          project_id = excluded.project_id,
          session_id = excluded.session_id,
          thread_url = excluded.thread_url,
          path = excluded.path,
          line = excluded.line,
          source = excluded.source,
          status = excluded.status,
          internal_state = excluded.internal_state,
          disposition = excluded.disposition,
          rationale = excluded.rationale,
          draft_reply = excluded.draft_reply,
          priority = excluded.priority,
          title = excluded.title,
          latest_comment_preview = excluded.latest_comment_preview,
          last_seen_comment_id = excluded.last_seen_comment_id,
          last_seen_updated_at = excluded.last_seen_updated_at,
          last_agent_run_at = excluded.last_agent_run_at,
          last_posted_reply_id = excluded.last_posted_reply_id,
          error = excluded.error,
          completed_at = excluded.completed_at,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `),
      markResolvedByThread: db.prepare(`
        UPDATE review_tasks
        SET status = 'done',
            completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE repo_id = ? AND pr_number = ? AND thread_id = ?
      `),
    };
  }

  get(id: string): ReviewTask | undefined {
    return this.stmts.getById.get(id) as ReviewTask | undefined;
  }

  getByRepoPr(repoId: string, prNumber: number): ReviewTask[] {
    return this.stmts.getByRepoPr.all(repoId, prNumber) as ReviewTask[];
  }

  upsertTask(task: ReviewTaskUpsert): ReviewTask {
    return this.stmts.upsert.get(
      task.id ?? randomUUID(),
      task.project_id,
      task.repo_id,
      task.session_id,
      task.pr_number,
      task.thread_id,
      task.thread_url,
      task.path,
      task.line,
      task.source,
      task.status,
      task.internal_state ?? null,
      task.disposition ?? null,
      task.rationale ?? null,
      task.draft_reply ?? null,
      task.priority,
      task.title,
      task.latest_comment_preview,
      task.last_seen_comment_id,
      task.last_seen_updated_at,
      task.last_agent_run_at ?? null,
      task.last_posted_reply_id ?? null,
      task.error ?? null,
      task.completed_at ?? null
    ) as ReviewTask;
  }

  updateStatus(id: string, status: ReviewTask['status'], meta?: ReviewTaskStatusUpdate): ReviewTask | undefined {
    const assignments = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const params: (string | null)[] = [status];

    if (meta && Object.prototype.hasOwnProperty.call(meta, 'error')) {
      assignments.push('error = ?');
      params.push(meta.error ?? null);
    }

    if (meta && Object.prototype.hasOwnProperty.call(meta, 'internal_state')) {
      assignments.push('internal_state = ?');
      params.push(meta.internal_state ?? null);
    }

    if (meta && Object.prototype.hasOwnProperty.call(meta, 'disposition')) {
      assignments.push('disposition = ?');
      params.push(meta.disposition ?? null);
    }

    if (meta && Object.prototype.hasOwnProperty.call(meta, 'rationale')) {
      assignments.push('rationale = ?');
      params.push(meta.rationale ?? null);
    }

    if (meta && Object.prototype.hasOwnProperty.call(meta, 'draft_reply')) {
      assignments.push('draft_reply = ?');
      params.push(meta.draft_reply ?? null);
    }

    if (meta && Object.prototype.hasOwnProperty.call(meta, 'last_agent_run_at')) {
      assignments.push('last_agent_run_at = ?');
      params.push(meta.last_agent_run_at ?? null);
    }

    if (meta && Object.prototype.hasOwnProperty.call(meta, 'last_posted_reply_id')) {
      assignments.push('last_posted_reply_id = ?');
      params.push(meta.last_posted_reply_id ?? null);
    }

    if (meta && Object.prototype.hasOwnProperty.call(meta, 'completed_at')) {
      assignments.push('completed_at = ?');
      params.push(meta.completed_at ?? null);
    } else if (status === 'done') {
      assignments.push('completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)');
    }

    const stmt = this.db.prepare(`
      UPDATE review_tasks
      SET ${assignments.join(', ')}
      WHERE id = ?
      RETURNING *
    `);

    return stmt.get(...params, id) as ReviewTask | undefined;
  }

  markResolvedByThread(repoId: string, prNumber: number, threadId: string): void {
    this.stmts.markResolvedByThread.run(repoId, prNumber, threadId);
  }
}
