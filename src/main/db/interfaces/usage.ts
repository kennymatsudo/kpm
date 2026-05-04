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
} from '../../../shared/usage-types';

import type {
  ClaudeUsageEvent,
  ClaudeUsageTotals,
  ClaudeUsageBreakdownRow,
} from '../../../shared/usage-types';

export interface ClaudeUsageEventInsert {
  project_id: string | null;
  source: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost_micro_usd: number;
}

export interface IClaudeUsageRepository {
  insert(event: ClaudeUsageEventInsert): ClaudeUsageEvent;
  /** Aggregate totals for a project (or all projects when projectId is null). */
  totalsByProject(projectId: string | null): ClaudeUsageTotals;
  /** Per-(source, model) breakdown for a project. */
  breakdownByProject(projectId: string | null): ClaudeUsageBreakdownRow[];
  /** Per-(source, model) breakdown across every project (and project-less events). */
  breakdownAll(): ClaudeUsageBreakdownRow[];
  /** Global totals across every project. */
  globalTotals(): ClaudeUsageTotals;
  /** Most recent events for a project (or globally when null). */
  listRecent(projectId: string | null, limit: number): ClaudeUsageEvent[];
  /** Drop all events for a project (used by reset). */
  deleteByProject(projectId: string): void;
}
