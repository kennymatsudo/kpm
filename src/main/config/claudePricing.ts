/**
 * Claude API pricing reference for cost estimation.
 *
 * Rates are USD per 1M tokens. We store cost in micro-USD (1 USD = 1_000_000)
 * to keep arithmetic in integer space.
 *
 * Cache write rate is the 5-minute cache; we don't currently distinguish 1h
 * cache (the SDK reports a single cache_creation_input_tokens count). Cache
 * read is the discounted rate the API charges for cached prefix reuse.
 *
 * Update these when pricing changes.
 */

export interface ModelPricing {
  /** USD per 1M input tokens (uncached) */
  input: number;
  /** USD per 1M output tokens */
  output: number;
  /** USD per 1M tokens written to the prompt cache (5m TTL) */
  cacheWrite: number;
  /** USD per 1M tokens read from the prompt cache */
  cacheRead: number;
}

const OPUS_PRICING: ModelPricing = {
};

const SONNET_PRICING: ModelPricing = {
  input: 3.0,
  output: 15.0,
  cacheWrite: 3.75,
  cacheRead: 0.3,
};

const HAIKU_PRICING: ModelPricing = {
  input: 1.0,
  output: 5.0,
  cacheWrite: 1.25,
  cacheRead: 0.1,
};

/**
 * Resolve a model identifier to its pricing tier. Accepts SDK aliases
 * ("opus" / "sonnet" / "haiku"), full model IDs ("claude-opus-4-8"), and
 * unknown strings (falls back to Sonnet pricing as a reasonable middle).
 */
export function resolveModelPricing(model: string | null | undefined): {
  pricing: ModelPricing;
  tier: 'opus' | 'sonnet' | 'haiku';
} {
  const m = (model ?? '').toLowerCase();
  if (m.includes('opus')) return { pricing: OPUS_PRICING, tier: 'opus' };
  if (m.includes('haiku')) return { pricing: HAIKU_PRICING, tier: 'haiku' };
  // Default to Sonnet (matches getConfig().generation.fastModel default).
  return { pricing: SONNET_PRICING, tier: 'sonnet' };
}

export interface UsageBreakdown {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

/** Compute cost in micro-USD (integer) for a usage breakdown on a given model. */
export function computeCostMicroUsd(model: string | null | undefined, usage: UsageBreakdown): number {
  const { pricing } = resolveModelPricing(model);
  // Per-million → per-token: rate * tokens / 1_000_000.
  // We want micro-USD (USD * 1_000_000), so the conversion cancels:
  //   micro_usd = rate_per_m * tokens
  // Use Math.round to keep the column an integer.
  const cost =
    pricing.input * usage.inputTokens +
    pricing.output * usage.outputTokens +
    pricing.cacheWrite * usage.cacheCreationTokens +
    pricing.cacheRead * usage.cacheReadTokens;
  return Math.round(cost);
}
