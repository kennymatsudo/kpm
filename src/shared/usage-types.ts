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
  sdk_session_id?: string | null;
  sdk_result_uuid?: string | null;
  sdk_cost_scope?: string | null;
  sdk_cumulative_cost_micro_usd?: number | null;
  cost_source?: string;
  ttft_ms: number | null;
  duration_ms: number | null;
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
 * Default context window sizes in tokens by model tier.
 * Used as a pre-first-turn fallback; the SDK reports the actual contextWindow
 * in ModelUsage on every result message and takes precedence after turn 1.
 *
 * The opus alias resolves to a 1M context window. The sonnet alias defaults
 * to the 200k tier (the 1M Sonnet variant requires usage credits and is a
 * separate model selection). Update when model families change.
 */
const CONTEXT_WINDOW_BY_TIER: Record<string, number> = {
  opus: 1_000_000,
  sonnet: 200_000,
  haiku: 200_000,
};

/**
 * Resolve a model identifier to its context window size in tokens.
 * Accepts SDK aliases ("opus" / "sonnet" / "haiku") and full model IDs
 * ("claude-opus-4-8"). Falls back to Sonnet's 200k for unknown strings.
 */
export function resolveModelContextWindow(model: string | null | undefined): number {
  const m = (model ?? '').toLowerCase();
  if (m.includes('opus')) return CONTEXT_WINDOW_BY_TIER.opus;
  if (m.includes('haiku')) return CONTEXT_WINDOW_BY_TIER.haiku;
  return CONTEXT_WINDOW_BY_TIER.sonnet;
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
