/**
 * ReviewOwnership Repository Implementation
 *
 * Persists which dev session owns review handling for a PR.
 */

import type { Database, Statement } from 'better-sqlite3';
import type { ReviewOwnership } from '../../../../shared/types';
import type { IReviewOwnershipRepository } from '../../interfaces';

interface PreparedStatements {
  get: Statement;
  set: Statement;
}

export class ReviewOwnershipRepository implements IReviewOwnershipRepository {
  private readonly stmts: PreparedStatements;

  constructor(db: Database) {
    this.stmts = {
      get: db.prepare(`
        SELECT * FROM review_ownership
        WHERE repo_id = ? AND pr_number = ?
      `),
      set: db.prepare(`
        INSERT INTO review_ownership (repo_id, pr_number, session_id)
        VALUES (?, ?, ?)
        ON CONFLICT(repo_id, pr_number) DO UPDATE SET
          session_id = excluded.session_id,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `),
    };
  }

  get(repoId: string, prNumber: number): ReviewOwnership | undefined {
    return this.stmts.get.get(repoId, prNumber) as ReviewOwnership | undefined;
  }

  set(repoId: string, prNumber: number, sessionId: string): ReviewOwnership {
    return this.stmts.set.get(repoId, prNumber, sessionId) as ReviewOwnership;
  }

}
