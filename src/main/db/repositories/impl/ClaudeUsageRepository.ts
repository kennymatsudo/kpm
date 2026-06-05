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
  ClaudeUsageProjectBreakdownRow,
} from '../../interfaces/usage';

interface PreparedStatements {
  insert: Statement;
  totalsByProject: Statement;
  totalsAllProjects: Statement;
  globalTotals: Statement;
  breakdownByProject: Statement;
  breakdownAllProjects: Statement;
  breakdownGlobal: Statement;
  breakdownByProjectAll: Statement;
  listRecentByProject: Statement;
  listRecentAllProjects: Statement;
  deleteByProject: Statement;
  lastSdkCumulativeCost: Statement;
  findBySdkResultScope: Statement;
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
        INSERT OR IGNORE INTO claude_usage_events (
          id, project_id, project_name_snapshot, source, model,
          input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
          cost_micro_usd, sdk_session_id, sdk_result_uuid, sdk_cost_scope,
          sdk_cumulative_cost_micro_usd, cost_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      breakdownByProjectAll: db.prepare(`
        SELECT
          u.project_id AS project_id,
          COALESCE(p.name, u.project_name_snapshot) AS project_name,
          COUNT(*) AS events,
          COALESCE(SUM(u.input_tokens), 0) AS input_tokens,
          COALESCE(SUM(u.output_tokens), 0) AS output_tokens,
          COALESCE(SUM(u.cache_creation_tokens), 0) AS cache_creation_tokens,
          COALESCE(SUM(u.cache_read_tokens), 0) AS cache_read_tokens,
          COALESCE(SUM(u.cost_micro_usd), 0) AS cost_micro_usd
        FROM claude_usage_events u
        LEFT JOIN projects p ON p.id = u.project_id
        GROUP BY u.project_id
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
      lastSdkCumulativeCost: db.prepare(`
        SELECT sdk_cumulative_cost_micro_usd
        FROM claude_usage_events
        WHERE sdk_session_id = ?
          AND sdk_cost_scope = ?
          AND sdk_cumulative_cost_micro_usd IS NOT NULL
        ORDER BY created_at DESC, rowid DESC
        LIMIT 1
      `),
      findBySdkResultScope: db.prepare(`
        SELECT * FROM claude_usage_events
        WHERE sdk_session_id = ?
          AND sdk_result_uuid = ?
          AND sdk_cost_scope = ?
          AND source = ?
        LIMIT 1
      `),
    };
  }

  insert(event: ClaudeUsageEventInsert): ClaudeUsageEvent {
    const id = randomUUID();
    const inserted = this.stmts.insert.get(
      id,
      event.project_id,
      event.project_name_snapshot,
      event.source,
      event.model,
      event.input_tokens,
      event.output_tokens,
      event.cache_creation_tokens,
      event.cache_read_tokens,
      event.cost_micro_usd,
      event.sdk_session_id ?? null,
      event.sdk_result_uuid ?? null,
      event.sdk_cost_scope ?? null,
      event.sdk_cumulative_cost_micro_usd ?? null,
      event.cost_source ?? 'local_pricing_fallback',
    ) as ClaudeUsageEvent | undefined;

    if (inserted) return inserted;

    if (event.sdk_session_id && event.sdk_result_uuid && event.sdk_cost_scope) {
      const existing = this.stmts.findBySdkResultScope.get(
        event.sdk_session_id,
        event.sdk_result_uuid,
        event.sdk_cost_scope,
        event.source,
      ) as ClaudeUsageEvent | undefined;
      if (existing) return existing;
    }

    throw new Error('Failed to insert Claude usage event');
  }

  getLastSdkCumulativeCostMicroUsd(sdkSessionId: string, sdkCostScope: string): number | null {
    const row = this.stmts.lastSdkCumulativeCost.get(sdkSessionId, sdkCostScope) as
      | { sdk_cumulative_cost_micro_usd: number | null }
      | undefined;
    return row?.sdk_cumulative_cost_micro_usd ?? null;
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

  breakdownByProjectAll(): ClaudeUsageProjectBreakdownRow[] {
    return this.stmts.breakdownByProjectAll.all() as ClaudeUsageProjectBreakdownRow[];
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
