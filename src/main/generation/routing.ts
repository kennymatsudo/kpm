/**
 * Resolves a (purpose, tier) to the concrete provider + model that will serve
 * a generation call. Reads `getConfig().generation` — the single place the
 * tier→model mapping and per-purpose provider routing live. Call sites no
 * longer read model config themselves.
 */

import { getConfig } from '../config';
import type { GenerationProvider, GenerationPurpose, GenerationTier } from './types';

export interface GenerationRoute {
  provider: GenerationProvider;
  model: string;
}

export function resolveGenerationRoute(
  purpose: GenerationPurpose,
  tier: GenerationTier,
): GenerationRoute {
  const gen = getConfig().generation;
  const provider = gen.providerByPurpose[purpose] ?? gen.defaultProvider;
  const model = provider === 'codex' ? gen.codexModels[tier] : claudeModelForTier(tier);
  return { provider, model };
}

/** The Claude model for a tier. Used directly by the seam's capability-gated
 *  fallback, which must re-resolve the model when it downgrades to Claude. */
export function claudeModelForTier(tier: GenerationTier): string {
  const gen = getConfig().generation;
  switch (tier) {
    case 'fast':
      return gen.fastModel;
    case 'deep':
      return gen.deepModel;
    case 'cheap':
      return gen.cheapModel;
  }
}
