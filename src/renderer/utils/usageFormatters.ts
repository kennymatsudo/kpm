/**
 * Formatters for the Claude usage dashboard.
 *
 * - Currency: always 2 decimals when >= $0.01; auto-extends to 4 decimals
 *   for sub-cent amounts so "$0.0023" doesn't round to "$0.00".
 * - Tokens: thousands-separated for tables.
 * - Sources/models: pretty labels for the dashboard taxonomy.
 */

export function microUsdToUsd(microUsd: number): number {
  return microUsd / 1_000_000;
}

export function formatCurrency(microUsd: number): string {
  const usd = microUsdToUsd(microUsd);
  if (usd === 0) return '$0.00';
  if (Math.abs(usd) < 0.01) {
    return `$${usd.toFixed(4)}`;
  }
  return `$${usd.toFixed(2)}`;
}

/** Full form for tables: "1,234,567". */
export function formatTokensFull(n: number): string {
  return n.toLocaleString('en-US');
}

const SOURCE_LABELS: Record<string, string> = {
  chat: 'Chat',
  board_implement: 'Board · Implement',
  board_review: 'Board · Review',
  briefing: 'Briefing',
  onboarding: 'Onboarding',
  pr_description: 'PR description',
  commit_message: 'Commit message',
  review_assessment: 'Review assessment',
  review_assessment_post_impl: 'Review reply',
  custom_prompt: 'Custom prompt',
  slack_triage: 'Slack triage',
  slack_triage_adapter: 'Slack triage (adapter)',
};

export function formatSource(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

const MODEL_LABELS: Record<string, string> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
};

export function formatModel(model: string): string {
  if (MODEL_LABELS[model]) return MODEL_LABELS[model];
  // Compact a full model id like "claude-opus-4-8" → "Opus 4.8"
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return modelWithVersion('Opus', model);
  if (lower.includes('sonnet')) return modelWithVersion('Sonnet', model);
  if (lower.includes('haiku')) return modelWithVersion('Haiku', model);
  return model;
}

function modelWithVersion(label: string, raw: string): string {
  const versionMatch = /(\d+)[-.](\d+)/.exec(raw);
  return versionMatch ? `${label} ${versionMatch[1]}.${versionMatch[2]}` : label;
}

export type ModelTier = 'opus' | 'sonnet' | 'haiku' | 'other';

export function resolveModelTier(model: string): ModelTier {
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('sonnet')) return 'sonnet';
  if (lower.includes('haiku')) return 'haiku';
  return 'other';
}

export function modelTierLabel(tier: ModelTier): string {
  if (tier === 'opus') return 'Opus';
  if (tier === 'sonnet') return 'Sonnet';
  if (tier === 'haiku') return 'Haiku';
  return 'Other';
}

/** Milliseconds → "14.2s". */
export function formatMsAsSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** ISO timestamp → "Mar 5, 2:14 PM". */
export function formatEventTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
