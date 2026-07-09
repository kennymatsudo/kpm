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
 * Default context window sizes in tokens by model family.
 * Used as a pre-first-turn fallback; provider SDKs do not consistently report
 * a context window with result usage, so the chat bar infers from the selected
 * provider/model id when the turn payload has no explicit value.
 *
 * The opus alias resolves to a 1M context window. The sonnet alias defaults
 * to the 200k tier (the 1M Sonnet variant requires usage credits and is a
 * separate model selection). Update when model families change.
 */
const CONTEXT_WINDOW_BY_FAMILY: Record<string, number> = {
  claudeOpus: 1_000_000,
  claudeSonnet: 200_000,
  claudeHaiku: 200_000,
  gpt5: 400_000,
  gpt4: 128_000,
};

const CURSOR_CONTEXT_WINDOW_BY_MODEL: Record<string, number> = {
  default: 200_000,
  auto: 200_000,
  'claude-sonnet-5@1m': 300_000,
  'claude-sonnet-5@300k': 300_000,
  fable: 300_000,
  'fable@1m': 300_000,
  'opus-latest@1m': 300_000,
  'opus-latest@1m:fast': 300_000,
  'sonnet-5@1m': 300_000,
  'gpt-5-mini': 272_000,
  'gpt-5.1': 272_000,
  'gpt-5.1-codex-max': 272_000,
  'gpt-5.1-codex-mini': 272_000,
  'gpt-5.2': 272_000,
  'gpt-5.2-codex': 272_000,
  'gpt-5.3-codex': 272_000,
  'gpt-5.3-codex-spark': 128_000,
  'gpt-5.4-mini': 272_000,
  'gpt-5.4-nano': 272_000,
  'gpt-5.5@272k': 272_000,
  'kimi-k2.5': 262_000,
};

const EXPLICIT_CONTEXT_PATTERN = /(?:^|[-_@/:])(?<amount>\d+(?:\.\d+)?)(?<unit>[km])(?:$|[-_@/:])/i;

function resolveCursorContextWindow(model: string): number | null {
  const selectorPrefix = 'cursor/';
  if (!model.startsWith(selectorPrefix)) return null;

  const cursorModelId = model.slice(selectorPrefix.length);
  return CURSOR_CONTEXT_WINDOW_BY_MODEL[cursorModelId]
    ?? CURSOR_CONTEXT_WINDOW_BY_MODEL[cursorModelId.replace(/:fast$/, '')]
    ?? CURSOR_CONTEXT_WINDOW_BY_MODEL.default;
}

/**
 * Extract a context-window suffix from provider model ids such as
 * `cursor/opus-latest@1m`, `claude-sonnet-4-5-200k`, or `model:128k`.
 */
function parseExplicitContextWindow(model: string): number | null {
  const match = EXPLICIT_CONTEXT_PATTERN.exec(model);
  if (!match?.groups) return null;

  const amount = Number(match.groups.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const multiplier = match.groups.unit.toLowerCase() === 'm' ? 1_000_000 : 1_000;
  return Math.round(amount * multiplier);
}

/**
 * Resolve a model identifier to its context window size in tokens.
 * Accepts SDK aliases ("opus" / "sonnet"), full model IDs
 * ("claude-opus-4-8"), Codex/OpenAI selections ("gpt-5.5"), and pi.dev
 * provider selectors ("cursor/opus-latest@1m", "openai-codex/gpt-5.4").
 * Falls back to Sonnet's 200k for unknown strings.
 */
export function resolveModelContextWindow(model: string | null | undefined): number {
  const m = (model ?? '').toLowerCase();
  const cursorContextWindow = resolveCursorContextWindow(m);
  if (cursorContextWindow) return cursorContextWindow;

  const explicit = parseExplicitContextWindow(m);
  if (explicit) return explicit;

  if (m.includes('opus')) return CONTEXT_WINDOW_BY_FAMILY.claudeOpus;
  if (m.includes('haiku')) return CONTEXT_WINDOW_BY_FAMILY.claudeHaiku;
  if (m.includes('sonnet')) return CONTEXT_WINDOW_BY_FAMILY.claudeSonnet;
  if (m.includes('gpt-5')) return CONTEXT_WINDOW_BY_FAMILY.gpt5;
  if (m.includes('gpt-4')) return CONTEXT_WINDOW_BY_FAMILY.gpt4;
  return CONTEXT_WINDOW_BY_FAMILY.claudeSonnet;
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
