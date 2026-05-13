/**
 * Public shapes for Claude usage tracking — safe to import from main, preload,
 * and renderer. The repository interface lives separately in
 * `src/main/db/interfaces/usage.ts` (main-only).
 */

export interface ClaudeUsageEvent {
  id: string;
  project_id: string | null;
  source: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost_micro_usd: number;
  created_at: string;
}

export interface ClaudeUsageTotals {
  events: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost_micro_usd: number;
}

export interface ClaudeUsageBreakdownRow extends ClaudeUsageTotals {
  source: string;
  model: string;
}

export interface ClaudeUsageProjectBreakdownRow extends ClaudeUsageTotals {
  project_id: string | null;
  project_name: string | null;
}

export interface ProjectUsageStats {
  projectId: string | null;
  totals: ClaudeUsageTotals;
  breakdown: ClaudeUsageBreakdownRow[];
  /** Per-project totals. Only populated when querying global stats. */
  byProject?: ClaudeUsageProjectBreakdownRow[];
}

/**
 * Live event broadcast to renderer on every tracked Claude turn.
 * Mirrors the payload sent on the `usage:event` IPC channel.
 */
export interface UsageLiveEvent {
  projectId: string | null;
  source: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costMicroUsd: number;
}
