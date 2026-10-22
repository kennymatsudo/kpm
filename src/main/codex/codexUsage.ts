/**
 * Codex token counts converted to KPM's usage convention.
 *
 * KPM follows Anthropic's shape: `input_tokens` is only the uncached remainder,
 * and cache reads and writes are counted beside it. Codex's `inputTokens` is the
 * whole prompt, cached tokens included (Codex itself derives non-cached input as
 * input minus cached). Passing it through unchanged counts every cache read twice,
 * in stored usage and in the context-fullness bar.
 */

export interface CodexTokenCounts {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
}

export interface KpmTokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export const ZERO_CODEX_TOKENS: CodexTokenCounts = {
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteInputTokens: 0,
  outputTokens: 0,
};

function count(...values: unknown[]): number {
  const value = values.find((candidate) => typeof candidate === 'number' && Number.isFinite(candidate));
  return typeof value === 'number' ? Math.max(0, value) : 0;
}

/** Read app-server's camelCase breakdown or the SDK's snake_case usage. */
export function readCodexTokenCounts(value: unknown): CodexTokenCounts {
  const raw = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  return {
    inputTokens: count(raw.inputTokens, raw.input_tokens),
    cachedInputTokens: count(raw.cachedInputTokens, raw.cached_input_tokens),
    cacheWriteInputTokens: count(raw.cacheWriteInputTokens, raw.cache_write_input_tokens),
    outputTokens: count(raw.outputTokens, raw.output_tokens),
  };
}

/**
 * Codex reports thread-cumulative totals, including across a resume, so one
 * turn's usage is the difference between two snapshots.
 */
export function subtractCodexTokens(after: CodexTokenCounts, before: CodexTokenCounts): CodexTokenCounts {
  return {
    inputTokens: Math.max(0, after.inputTokens - before.inputTokens),
    cachedInputTokens: Math.max(0, after.cachedInputTokens - before.cachedInputTokens),
    cacheWriteInputTokens: Math.max(0, after.cacheWriteInputTokens - before.cacheWriteInputTokens),
    outputTokens: Math.max(0, after.outputTokens - before.outputTokens),
  };
}

export function toKpmUsage(counts: CodexTokenCounts): KpmTokenUsage {
  return {
    input_tokens: Math.max(0, counts.inputTokens - counts.cachedInputTokens - counts.cacheWriteInputTokens),
    output_tokens: counts.outputTokens,
    cache_read_input_tokens: counts.cachedInputTokens,
    cache_creation_input_tokens: counts.cacheWriteInputTokens,
  };
}
