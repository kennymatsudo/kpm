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

export type ModelTier = 'fable' | 'opus' | 'sonnet' | 'haiku';

/** Cache writes bill at 1.25x input on every model; cache reads vary. */
function pricing(input: number, output: number, cacheRead: number): ModelPricing {
  return { input, output, cacheWrite: input * 1.25, cacheRead };
}

const FABLE_5_1_PRICING = pricing(10, 50, 0.25);
const FABLE_5_PRICING = pricing(10, 50, 1.0);
const OPUS_5_5_PRICING = pricing(4, 20, 0.2);
const OPUS_5_PRICING = pricing(5, 25, 0.5);
const SONNET_5_PRICING = pricing(2, 10, 0.2);
const SONNET_4_PRICING = pricing(3, 15, 0.3);
const HAIKU_PRICING = pricing(1, 5, 0.1);

// Bare aliases are priced as the model the Claude Agent SDK currently resolves
// them to. Re-check on every SDK bump: the alias target moves silently.
const ALIAS_PRICING: Record<string, { pricing: ModelPricing; tier: ModelTier }> = {
  opus: { pricing: OPUS_5_5_PRICING, tier: 'opus' },
  sonnet: { pricing: SONNET_5_PRICING, tier: 'sonnet' },
  haiku: { pricing: HAIKU_PRICING, tier: 'haiku' },
};

// Matched in order, so a version must precede any shorter id it contains
// ("opus-5-5" before "opus-5"). The last entry per family covers older and
// not-yet-listed versions.
const MODEL_PRICING: readonly { match: string; pricing: ModelPricing; tier: ModelTier }[] = [
  { match: 'fable-5-1', pricing: FABLE_5_1_PRICING, tier: 'fable' },
  { match: 'mythos-5-1', pricing: FABLE_5_1_PRICING, tier: 'fable' },
  { match: 'fable', pricing: FABLE_5_PRICING, tier: 'fable' },
  { match: 'mythos', pricing: FABLE_5_PRICING, tier: 'fable' },
  { match: 'opus-5-5', pricing: OPUS_5_5_PRICING, tier: 'opus' },
  { match: 'opus', pricing: OPUS_5_PRICING, tier: 'opus' },
  { match: 'sonnet-5', pricing: SONNET_5_PRICING, tier: 'sonnet' },
  { match: 'sonnet', pricing: SONNET_4_PRICING, tier: 'sonnet' },
  { match: 'haiku', pricing: HAIKU_PRICING, tier: 'haiku' },
];

/**
 * Resolve a model identifier to its pricing. Accepts SDK aliases
 * ("opus" / "sonnet" / "haiku"), full model IDs ("claude-<family>-<version>"), and
 * unknown strings (falls back to current Sonnet pricing as a reasonable middle).
 */
export function resolveModelPricing(model: string | null | undefined): {
  pricing: ModelPricing;
  tier: ModelTier;
} {
  const m = (model ?? '').toLowerCase();
  const alias = ALIAS_PRICING[m];
  if (alias) return alias;
  const entry = MODEL_PRICING.find(({ match }) => m.includes(match));
  if (entry) return { pricing: entry.pricing, tier: entry.tier };
  // Default to Sonnet (matches getConfig().generation.fastModel default).
  return ALIAS_PRICING.sonnet;
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
