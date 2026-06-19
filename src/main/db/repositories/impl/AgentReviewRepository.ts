/**
 * AgentReview Repository Implementation
 *
 * Persists opposing-agent review runs and their findings for implementation sessions.
 */

import { randomUUID } from 'crypto';
import type { Database, Statement } from 'better-sqlite3';
import type { AgentType, PersistedAgentReview, ReviewFinding } from '../../../../shared/agent-types';
import type {
  IAgentReviewRepository,
  PersistedAgentReviewFailure,
  PersistedAgentReviewStart,
  PersistedAgentReviewUpsert,
} from '../../interfaces';

interface AgentReviewRunRow {
  id: string;
  implementation_session_id: string;
  review_session_id: string;
  reviewer_agent: PersistedAgentReview['reviewer_agent'];
  status: PersistedAgentReview['status'];
  diff_fingerprint: string | null;
  raw_output: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface AgentReviewFindingRow {
  id: string;
  review_run_id: string;
  finding_order: number;
  severity: ReviewFinding['severity'];
  file: string;
  line: number | null;
  description: string;
  agent: ReviewFinding['agent'];
  source: ReviewFinding['source'];
}

interface PreparedStatements {
  insertStartedRun: Statement;
  insertTerminalRun: Statement;
  getLatestRunningRun: Statement;
  completeRun: Statement;
  failRun: Statement;
  failRunningByImplementation: Statement;
  deleteFindingsByRunId: Statement;
  insertFinding: Statement;
  getLatestByImplementationSessionIds: (placeholders: string) => Statement;
  getReviewerAgentsByImplementationSessionIds: (placeholders: string) => Statement;
  getFindingsByRunIds: (placeholders: string) => Statement;
  markLatestCompletedStale: Statement;
}

function hydrateReview(
  run: AgentReviewRunRow,
  findings: AgentReviewFindingRow[] | undefined
): PersistedAgentReview {
  return {
    ...run,
    findings: (findings ?? []).map((finding) => ({
      severity: finding.severity,
      file: finding.file,
      line: finding.line ?? undefined,
      description: finding.description,
      agent: finding.agent,
      source: finding.source,
    })),
  };
}

export class AgentReviewRepository implements IAgentReviewRepository {
  private readonly db: Database;
  private readonly stmts: PreparedStatements;

  constructor(db: Database) {
    this.db = db;
    this.stmts = {
      insertStartedRun: db.prepare(`
        INSERT INTO agent_review_runs (
          id,
          implementation_session_id,
          review_session_id,
          reviewer_agent,
          status,
          diff_fingerprint,
          raw_output,
          error,
          completed_at
        )
        VALUES (?, ?, ?, ?, 'running', ?, NULL, NULL, NULL)
      `),
      insertTerminalRun: db.prepare(`
        INSERT INTO agent_review_runs (
          id,
          implementation_session_id,
          review_session_id,
          reviewer_agent,
          status,
          diff_fingerprint,
          raw_output,
          error,
          completed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `),
      getLatestRunningRun: db.prepare(`
        SELECT id
        FROM agent_review_runs
        WHERE implementation_session_id = ?
          AND review_session_id = ?
          AND reviewer_agent = ?
          AND status = 'running'
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT 1
      `),
      completeRun: db.prepare(`
        UPDATE agent_review_runs
        SET status = 'complete',
            diff_fingerprint = ?,
            raw_output = ?,
            error = NULL,
            updated_at = CURRENT_TIMESTAMP,
            completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),
      failRun: db.prepare(`
        UPDATE agent_review_runs
        SET status = 'failed',
            diff_fingerprint = ?,
            raw_output = ?,
            error = ?,
            updated_at = CURRENT_TIMESTAMP,
            completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),
      failRunningByImplementation: db.prepare(`
        UPDATE agent_review_runs
        SET status = 'failed',
            error = ?,
            updated_at = CURRENT_TIMESTAMP,
            completed_at = CURRENT_TIMESTAMP
        WHERE implementation_session_id = ?
          AND status = 'running'
      `),
      deleteFindingsByRunId: db.prepare(`
        DELETE FROM agent_review_findings
        WHERE review_run_id = ?
      `),
      insertFinding: db.prepare(`
        INSERT INTO agent_review_findings (
          id,
          review_run_id,
          finding_order,
          severity,
          file,
          line,
          description,
          agent,
          source
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      getLatestByImplementationSessionIds: (placeholders: string) => db.prepare(`
        SELECT
          id,
          implementation_session_id,
          review_session_id,
          reviewer_agent,
          status,
          diff_fingerprint,
          raw_output,
          error,
          created_at,
          updated_at,
          completed_at
        FROM (
          SELECT
            arr.*,
            ROW_NUMBER() OVER (
              PARTITION BY arr.implementation_session_id
              ORDER BY
                datetime(COALESCE(arr.completed_at, arr.updated_at, arr.created_at)) DESC,
                datetime(arr.created_at) DESC,
                arr.id DESC
            ) AS row_num
          FROM agent_review_runs arr
          WHERE arr.implementation_session_id IN (${placeholders})
        )
        WHERE row_num = 1
      `),
      getReviewerAgentsByImplementationSessionIds: (placeholders: string) => db.prepare(`
        SELECT DISTINCT implementation_session_id, reviewer_agent
        FROM agent_review_runs
        WHERE implementation_session_id IN (${placeholders})
          AND status IN ('complete', 'stale')
      `),
      getFindingsByRunIds: (placeholders: string) => db.prepare(`
        SELECT
          id,
          review_run_id,
          finding_order,
          severity,
          file,
          line,
          description,
          agent,
          source
        FROM agent_review_findings
        WHERE review_run_id IN (${placeholders})
        ORDER BY review_run_id, finding_order ASC
      `),
      markLatestCompletedStale: db.prepare(`
        UPDATE agent_review_runs
        SET status = 'stale',
            updated_at = CURRENT_TIMESTAMP
        WHERE implementation_session_id = ?
          AND status = 'complete'
      `),
    };
  }

  persistStartedReview(review: PersistedAgentReviewStart): PersistedAgentReview {
    const runId = randomUUID();

    const tx = this.db.transaction(() => {
      this.stmts.failRunningByImplementation.run(
        'Superseded by a newer review run',
        review.implementation_session_id
      );
      this.stmts.insertStartedRun.run(
        runId,
        review.implementation_session_id,
        review.review_session_id,
        review.reviewer_agent,
        review.diff_fingerprint ?? null
      );
    });

    tx();

    return this.getLatestByImplementationSessionIds([review.implementation_session_id])[0];
  }

  persistCompletedReview(review: PersistedAgentReviewUpsert): PersistedAgentReview {
    let runId: string = randomUUID();

    const tx = this.db.transaction(() => {
      this.stmts.markLatestCompletedStale.run(review.implementation_session_id);

      const running = this.stmts.getLatestRunningRun.get(
        review.implementation_session_id,
        review.review_session_id,
        review.reviewer_agent
      ) as { id: string } | undefined;
      if (running) {
        runId = running.id;
        this.stmts.deleteFindingsByRunId.run(runId);
        this.stmts.completeRun.run(
          review.diff_fingerprint ?? null,
          review.raw_output ?? null,
          runId
        );
      } else {
        this.stmts.insertTerminalRun.run(
          runId,
          review.implementation_session_id,
          review.review_session_id,
          review.reviewer_agent,
          'complete',
          review.diff_fingerprint ?? null,
          review.raw_output ?? null,
          null
        );
      }

      review.findings.forEach((finding: ReviewFinding, index: number) => {
        this.stmts.insertFinding.run(
          randomUUID(),
          runId,
          index,
          finding.severity,
          finding.file,
          finding.line ?? null,
          finding.description,
          finding.agent,
          finding.source
        );
      });
    });

    tx();

    return this.getLatestByImplementationSessionIds([review.implementation_session_id])[0];
  }

  persistFailedReview(review: PersistedAgentReviewFailure): PersistedAgentReview {
    let runId: string = randomUUID();

    const tx = this.db.transaction(() => {
      const running = this.stmts.getLatestRunningRun.get(
        review.implementation_session_id,
        review.review_session_id,
        review.reviewer_agent
      ) as { id: string } | undefined;
      if (running) {
        runId = running.id;
        this.stmts.deleteFindingsByRunId.run(runId);
        this.stmts.failRun.run(
          review.diff_fingerprint ?? null,
          review.raw_output ?? null,
          review.error,
          runId
        );
      } else {
        this.stmts.insertTerminalRun.run(
          runId,
          review.implementation_session_id,
          review.review_session_id,
          review.reviewer_agent,
          'failed',
          review.diff_fingerprint ?? null,
          review.raw_output ?? null,
          review.error
        );
      }
    });

    tx();

    return this.getLatestByImplementationSessionIds([review.implementation_session_id])[0];
  }

  getLatestByImplementationSessionIds(sessionIds: string[]): PersistedAgentReview[] {
    if (sessionIds.length === 0) {
      return [];
    }

    const placeholders = sessionIds.map(() => '?').join(', ');
    const runs = this.stmts.getLatestByImplementationSessionIds(placeholders).all(...sessionIds) as AgentReviewRunRow[];
    if (runs.length === 0) {
      return [];
    }

    const runIds = runs.map((run) => run.id);
    const findingPlaceholders = runIds.map(() => '?').join(', ');
    const findingRows = this.stmts.getFindingsByRunIds(findingPlaceholders).all(...runIds) as AgentReviewFindingRow[];

    const findingsByRunId = new Map<string, AgentReviewFindingRow[]>();
    for (const finding of findingRows) {
      const existing = findingsByRunId.get(finding.review_run_id) ?? [];
      existing.push(finding);
      findingsByRunId.set(finding.review_run_id, existing);
    }

    return runs.map((run) => hydrateReview(run, findingsByRunId.get(run.id)));
  }

  getReviewerAgentsByImplementationSessionIds(sessionIds: string[]): Map<string, AgentType[]> {
    const result = new Map<string, AgentType[]>();
    if (sessionIds.length === 0) {
      return result;
    }

    const placeholders = sessionIds.map(() => '?').join(', ');
    const rows = this.stmts
      .getReviewerAgentsByImplementationSessionIds(placeholders)
      .all(...sessionIds) as { implementation_session_id: string; reviewer_agent: AgentType }[];

    for (const row of rows) {
      const existing = result.get(row.implementation_session_id);
      if (existing) {
        if (!existing.includes(row.reviewer_agent)) {
          existing.push(row.reviewer_agent);
        }
      } else {
        result.set(row.implementation_session_id, [row.reviewer_agent]);
      }
    }

    return result;
  }

  markLatestCompletedStale(implementationSessionId: string): void {
    this.stmts.markLatestCompletedStale.run(implementationSessionId);
  }
}
