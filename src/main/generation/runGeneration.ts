/**
 * runGeneration — the single seam for one-shot AI generation.
 *
 * Resolves a (purpose, tier) to a provider + model, dispatches to that
 * provider's adapter (falling back to Claude if the routed provider has no
 * adapter registered), and records usage keyed by (purpose, provider). Call
 * sites pass intent — purpose, tier, prompt — never provider SDK options.
 */

import { claudeGenerationProvider } from './claudeGenerationProvider';
import { codexGenerationProvider } from './codexGenerationProvider';
import { claudeModelForTier, resolveGenerationRoute } from './routing';
import { getGenerationRuntimeDeps } from './runtime';
import type {
  GenerationProvider,
  GenerationProviderAdapter,
  GenerationRequest,
  GenerationResult,
  ResolvedGenerationRequest,
} from './types';

const ADAPTERS: Partial<Record<GenerationProvider, GenerationProviderAdapter>> = {
  claude: claudeGenerationProvider,
  codex: codexGenerationProvider,
};

/** Register a provider adapter. Called once per provider at startup. */
export function registerGenerationProvider(adapter: GenerationProviderAdapter): void {
  ADAPTERS[adapter.provider] = adapter;
}

export async function runGeneration(request: GenerationRequest): Promise<GenerationResult> {
  const route = resolveGenerationRoute(request.purpose, request.tier);

  let provider = route.provider;
  let model = route.model;
  let adapter = ADAPTERS[provider];

  if (!adapter) {
    if (provider !== 'claude') {
      console.warn(
        `[generation] no adapter registered for ${provider} (purpose=${request.purpose}); falling back to claude`,
      );
    }
    provider = 'claude';
    model = claudeModelForTier(request.tier);
    adapter = ADAPTERS.claude;
  }

  if (!adapter) {
    throw new Error('No generation provider available (claude adapter not registered)');
  }

  const resolved: ResolvedGenerationRequest = { ...request, provider, model };
  const { recordUsage } = getGenerationRuntimeDeps();

  return adapter.run(resolved, {
    onUsage: recordUsage
      ? (usage, totalCostUsd) =>
          recordUsage({
            purpose: request.purpose,
            provider,
            model,
            projectId: request.projectId ?? null,
            usage,
            totalCostUsd,
          })
      : undefined,
  });
}
