/**
 * ReviewSyncState Repository Implementation
 *
 * Persists refresh metadata for PR review sync operations.
 */

import type { Database, Statement } from 'better-sqlite3';
import type { ReviewSyncState } from '../../../../shared/types';
import type { IReviewSyncStateRepository, ReviewSyncStateUpsert } from '../../interfaces';

interface PreparedStatements {
  get: Statement;
  upsert: Statement;
}

export class ReviewSyncStateRepository implements IReviewSyncStateRepository {
  private readonly db: Database;
  private readonly stmts: PreparedStatements;

  constructor(db: Database) {
    this.db = db;
    this.stmts = {
      get: db.prepare(`
        SELECT * FROM review_sync_state
        WHERE repo_id = ? AND pr_number = ?
      `),
      upsert: db.prepare(`
        INSERT INTO review_sync_state (
          repo_id, pr_number, session_id, last_fetched_at, last_successful_fetched_at,
          last_head_oid, last_review_decision, last_error,
          last_pr_updated_at, probe_digest
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(repo_id, pr_number) DO UPDATE SET
          session_id = excluded.session_id,
          last_fetched_at = excluded.last_fetched_at,
          last_successful_fetched_at = excluded.last_successful_fetched_at,
          last_head_oid = excluded.last_head_oid,
          last_review_decision = excluded.last_review_decision,
          last_error = excluded.last_error,
          last_pr_updated_at = excluded.last_pr_updated_at,
          probe_digest = excluded.probe_digest
        RETURNING *
      `),
    };
  }

  get(repoId: string, prNumber: number): ReviewSyncState | undefined {
    return this.stmts.get.get(repoId, prNumber) as ReviewSyncState | undefined;
  }

  upsert(state: ReviewSyncStateUpsert): ReviewSyncState {
    return this.stmts.upsert.get(
      state.repo_id,
      state.pr_number,
      state.session_id,
      state.last_fetched_at,
      state.last_successful_fetched_at,
      state.last_head_oid,
      state.last_review_decision,
      state.last_error ?? null,
      state.last_pr_updated_at ?? null,
      state.probe_digest ?? null
    ) as ReviewSyncState;
  }

  updateError(repoId: string, prNumber: number, error: string | null): ReviewSyncState | undefined {
    const stmt = this.db.prepare(`
      INSERT INTO review_sync_state (
        repo_id, pr_number, session_id, last_fetched_at, last_successful_fetched_at,
        last_head_oid, last_review_decision, last_error,
        last_pr_updated_at, probe_digest
      )
      VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, ?, NULL, NULL)
      ON CONFLICT(repo_id, pr_number) DO UPDATE SET
        last_error = excluded.last_error
      RETURNING *
    `);

    return stmt.get(repoId, prNumber, error) as ReviewSyncState | undefined;
  }
}
