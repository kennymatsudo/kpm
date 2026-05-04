/**
 * Claude Usage Repository
 *
 * Append-only event log of Claude API token usage and estimated cost.
 * One row per result/turn returned by the SDK. Surfaces aggregates by
 * project, source, and model for the usage dashboard.
 */

import type { Database, Statement } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type {
  IClaudeUsageRepository,
  ClaudeUsageEvent,
  ClaudeUsageEventInsert,
  ClaudeUsageTotals,
  ClaudeUsageBreakdownRow,
} from '../../interfaces/usage';

interface PreparedStatements {
  insert: Statement;
  totalsByProject: Statement;
  totalsAllProjects: Statement;
  globalTotals: Statement;
  breakdownByProject: Statement;
  breakdownAllProjects: Statement;
  breakdownGlobal: Statement;
  listRecentByProject: Statement;
  listRecentAllProjects: Statement;
  deleteByProject: Statement;
}

const EMPTY_TOTALS: ClaudeUsageTotals = {
  events: 0,
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_tokens: 0,
  cache_read_tokens: 0,
  cost_micro_usd: 0,
};

export class ClaudeUsageRepository implements IClaudeUsageRepository {
  private stmts: PreparedStatements;

  constructor(private db: Database) {
    const totalsSelect = `
      SELECT
        COUNT(*) AS events,
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens,
        COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
        COALESCE(SUM(cost_micro_usd), 0) AS cost_micro_usd
      FROM claude_usage_events
    `;

    const breakdownSelect = `
      SELECT
        source,
        model,
        COUNT(*) AS events,
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens,
        COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
        COALESCE(SUM(cost_micro_usd), 0) AS cost_micro_usd
      FROM claude_usage_events
    `;

    this.stmts = {
      insert: db.prepare(`
          input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
        RETURNING *
      `),
      totalsByProject: db.prepare(`${totalsSelect} WHERE project_id = ?`),
      totalsAllProjects: db.prepare(`${totalsSelect} WHERE project_id IS NULL`),
      globalTotals: db.prepare(totalsSelect),
      breakdownByProject: db.prepare(`
        ${breakdownSelect}
        WHERE project_id = ?
        GROUP BY source, model
        ORDER BY cost_micro_usd DESC
      `),
      breakdownAllProjects: db.prepare(`
        ${breakdownSelect}
        WHERE project_id IS NULL
        GROUP BY source, model
        ORDER BY cost_micro_usd DESC
      `),
      breakdownGlobal: db.prepare(`
        ${breakdownSelect}
        GROUP BY source, model
        ORDER BY cost_micro_usd DESC
      `),
      listRecentByProject: db.prepare(`
        SELECT * FROM claude_usage_events
        WHERE project_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `),
      listRecentAllProjects: db.prepare(`
        SELECT * FROM claude_usage_events
        ORDER BY created_at DESC
        LIMIT ?
      `),
      deleteByProject: db.prepare('DELETE FROM claude_usage_events WHERE project_id = ?'),
    };
  }

  insert(event: ClaudeUsageEventInsert): ClaudeUsageEvent {
    const id = randomUUID();
      id,
      event.project_id,
      event.source,
      event.model,
      event.input_tokens,
      event.output_tokens,
      event.cache_creation_tokens,
      event.cache_read_tokens,
      event.cost_micro_usd,
  }

  totalsByProject(projectId: string | null): ClaudeUsageTotals {
    const row = projectId === null
      ? this.stmts.totalsAllProjects.get()
      : this.stmts.totalsByProject.get(projectId);
    return (row as ClaudeUsageTotals | undefined) ?? { ...EMPTY_TOTALS };
  }

  breakdownByProject(projectId: string | null): ClaudeUsageBreakdownRow[] {
    const rows = projectId === null
      ? this.stmts.breakdownAllProjects.all()
      : this.stmts.breakdownByProject.all(projectId);
    return rows as ClaudeUsageBreakdownRow[];
  }

  breakdownAll(): ClaudeUsageBreakdownRow[] {
    return this.stmts.breakdownGlobal.all() as ClaudeUsageBreakdownRow[];
  }

  globalTotals(): ClaudeUsageTotals {
    const row = this.stmts.globalTotals.get();
    return (row as ClaudeUsageTotals | undefined) ?? { ...EMPTY_TOTALS };
  }

  listRecent(projectId: string | null, limit: number): ClaudeUsageEvent[] {
    const safeLimit = Math.max(1, Math.min(limit, 500));
    const rows = projectId === null
      ? this.stmts.listRecentAllProjects.all(safeLimit)
      : this.stmts.listRecentByProject.all(projectId, safeLimit);
    return rows as ClaudeUsageEvent[];
  }

  deleteByProject(projectId: string): void {
    this.stmts.deleteByProject.run(projectId);
  }
}
