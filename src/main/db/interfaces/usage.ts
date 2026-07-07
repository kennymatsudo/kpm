/**
 * Claude usage tracking repository interface.
 *
 * Append-only event log of Claude API token usage and estimated cost,
 * one row per result/turn. Used to surface per-project and per-source
 * cost breakdowns and to drive the "session_*" rollup columns on projects.
 *
 * Public DTOs live in `src/shared/usage-types.ts` (renderer-safe). This file
 * re-exports them and adds the main-process-only repository interface.
 */

export type {
  ClaudeUsageEvent,
  ClaudeUsageTotals,
  ClaudeUsageBreakdownRow,
  ClaudeUsageProjectBreakdownRow,
} from '../../../shared/usage-types';

import type {
  ClaudeUsageEvent,
  ClaudeUsageTotals,
  ClaudeUsageBreakdownRow,
  ClaudeUsageProjectBreakdownRow,
} from '../../../shared/usage-types';

export interface ClaudeUsageEventInsert {
  project_id: string | null;
  /**
   * Project name captured at insert time. Used as the fallback display name in
   * per-project breakdowns once the project row has been deleted; while the
   * project still exists, the live `projects.name` is preferred so renames
   * propagate through history.
   */
  project_name_snapshot: string | null;
  source: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost_micro_usd: number;
  sdk_session_id?: string | null;
  sdk_result_uuid?: string | null;
  sdk_cost_scope?: string | null;
  sdk_cumulative_cost_micro_usd?: number | null;
  cost_source?: string;
  ttft_ms?: number | null;
  duration_ms?: number | null;
}

export interface IClaudeUsageRepository {
  insert(event: ClaudeUsageEventInsert): ClaudeUsageEvent;
  /** Last SDK cumulative cost snapshot for a session/scope pair. */
  getLastSdkCumulativeCostMicroUsd(sdkSessionId: string, sdkCostScope: string): number | null;
  /** Aggregate totals for a project (or all projects when projectId is null). */
  totalsByProject(projectId: string | null): ClaudeUsageTotals;
  /** Per-(source, model) breakdown for a project. */
  breakdownByProject(projectId: string | null): ClaudeUsageBreakdownRow[];
  /** Per-(source, model) breakdown across every project (and project-less events). */
  breakdownAll(): ClaudeUsageBreakdownRow[];
  /**
   * Per-project totals across every project. Joins with `projects` so callers
   * can render names; events with a null project_id (cross-project work)
   * roll up into a single row with `project_id = null`.
   */
  breakdownByProjectAll(): ClaudeUsageProjectBreakdownRow[];
  /** Global totals across every project. */
  globalTotals(): ClaudeUsageTotals;
  /** Most recent events for a project (or globally when null). */
  listRecent(projectId: string | null, limit: number): ClaudeUsageEvent[];
  /** Drop all events for a project (used by reset). */
  deleteByProject(projectId: string): void;
}
