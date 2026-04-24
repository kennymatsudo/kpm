/**
 * AgentReview Repository Implementation
 *
 * Persists opposing-agent review runs and their findings for implementation sessions.
 */

import { randomUUID } from 'crypto';
import type { Database, Statement } from 'better-sqlite3';
import type { AgentType, PersistedAgentReview, ReviewFinding } from '../../../../shared/agent-types';

interface AgentReviewRunRow {
  id: string;
  implementation_session_id: string;
  review_session_id: string;
  reviewer_agent: PersistedAgentReview['reviewer_agent'];
  status: PersistedAgentReview['status'];
  diff_fingerprint: string | null;
  raw_output: string | null;
  created_at: string;
  updated_at: string;
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
        INSERT INTO agent_review_runs (
          id,
          implementation_session_id,
          review_session_id,
          reviewer_agent,
          status,
          diff_fingerprint,
        )
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
          created_at,
          updated_at,
          completed_at
        FROM (
          SELECT
            arr.*,
            ROW_NUMBER() OVER (
              PARTITION BY arr.implementation_session_id
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

    const runId = randomUUID();

    const tx = this.db.transaction(() => {
        runId,
        review.implementation_session_id,
        review.review_session_id,
        review.reviewer_agent,
      );

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
