/**
 * pi.dev provider/model enumeration and safe/unsafe classification.
 *
 * The enumeration itself runs in a child process (`piCatalog.ts`); this module
 * owns the classification, which must stay in the main process because it is
 * the decision, not the data.
 *
 * SAFETY-CRITICAL: `safe` gates whether a provider/model may ever be selected
 * for KPM's read-only main chat (P7). See `isPiProviderSafe` below for the
 * exact signal used and its limits.
 */

import { PI_UNRESOLVED_MODEL_ID, type PiProviderOption } from '../../shared/types';
import { readPiCatalog, type PiCatalogSnapshot } from './piCatalog';

export type { PiProviderOption };

function modelContextWindow(model: { contextWindow?: number }): number | undefined {
  return typeof model.contextWindow === 'number' && Number.isFinite(model.contextWindow) && model.contextWindow > 0
    ? model.contextWindow
    : undefined;
}

/**
 * Providers shipped in pi-ai's own built-in catalog, plus providers shipped by
 * pi-coding-agent's built-in extensions (`llama.cpp`). The catalog was verified
 * by reading `builtinProviders()` in
 * `node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/providers/all.js`;
 * built-in extension providers were verified under `pi-coding-agent/dist/extensions`.
 * `builtinProviders()` is the registry, not `models.generated.js` — the latter
 * holds only providers that ship a static model list, so it omits gateway-driven
 * ones such as `radius`, whose catalog is fetched at runtime.
 * Every one of these models is driven through
 * one of pi-ai's own bundled API-dialect implementations (`anthropic-messages`,
 * `openai-codex-responses`, etc.) — pi's own `AgentSession` runs the ReAct
 * loop and executes tool calls itself for all of them, so KPM's
 * `buildToolCallGate` (in `PiChatSession.ts`) sees and gates every tool call.
 *
 * A provider NOT on this list is either unknown or was registered at runtime
 * by an installed pi extension via `ModelRegistry.registerProvider()` (e.g.
 * `cursor`, added by the `pi-cursor-sdk` extension). That API lets the
 * extension supply its own `streamSimple` implementation, which can run
 * arbitrary code — including driving its own embedded agent with full
 * read/write tool access — before ever handing a response back to pi. pi's
 * tool gate has no visibility into that code path. Such providers default to
 * `safe: false` unless the user has explicitly trusted one (see
 * `USER_TRUSTED_PI_PROVIDERS` below) — `cursor` is currently trusted that way.
 *
 * TODO(pi.dev): this allowlist is hand-curated from pi-ai's bundled provider
 * catalog and pi-coding-agent's built-in extensions rather than read from the
 * SDK at runtime — `pi-coding-agent`'s public exports (`index.d.ts`) don't
 * re-export pi-ai's built-in provider catalog, and `@earendil-works/pi-ai`
 * isn't a direct KPM dependency (only nested under `pi-coding-agent`'s own
 * `node_modules`), so there's no import path that would keep this list in sync
 * automatically. It will silently miss a new built-in provider added in a
 * future `pi-coding-agent` upgrade (that
 * provider would default to `safe: false`, the conservative direction) and,
 * more importantly, would NOT catch a future built-in provider that itself
 * ships an embedded agent runtime — this allowlist trusts "built into pi-ai"
 * as a proxy for "drives its native tool loop," which holds for every
 * provider verified above but is not a guarantee. It also does not catch a
 * malicious/buggy locally-installed pi extension that calls
 * `registerProvider()` under an already-known-native provider name (out of
 * scope: KPM already trusts the user's local pi installation and its
 * extensions, the same trust boundary as Claude Code's local extensions).
 * A name list also cannot cover a user's own radius gateway: pi promotes any
 * `~/.pi/agent/models.json` provider with `oauth: "radius"` and a `baseUrl` into
 * a native radius provider under whatever id the user chose
 * (`ModelRuntime.configureRadiusProviders`), so such a provider is natively
 * driven yet unnameable here and falls to `safe: false`.
 * Re-verify this list against `builtinProviders()` in `providers/all.js` on
 * every `@earendil-works/pi-coding-agent` version bump.
 */
const KNOWN_NATIVE_PI_PROVIDERS = new Set<string>([
  'amazon-bedrock',
  'ant-ling',
  'anthropic',
  'azure-openai-responses',
  'cerebras',
  'cloudflare-ai-gateway',
  'cloudflare-workers-ai',
  'deepseek',
  'fireworks',
  'github-copilot',
  'google',
  'google-vertex',
  'groq',
  'huggingface',
  'kimi-coding',
  'llama.cpp',
  'minimax',
  'minimax-cn',
  'mistral',
  'moonshotai',
  'moonshotai-cn',
  'nvidia',
  'openai',
  'openai-codex',
  'opencode',
  'opencode-go',
  'openrouter',
  'qwen-token-plan',
  'qwen-token-plan-cn',
  'radius',
  'together',
  'vercel-ai-gateway',
  'xai',
  'xiaomi',
  'xiaomi-token-plan-ams',
  'xiaomi-token-plan-cn',
  'xiaomi-token-plan-sgp',
  'zai',
  'zai-coding-cn',
]);

/**
 * Providers the user has explicitly chosen to trust despite NOT being driven
 * by pi-ai's native tool loop. Unlike `KNOWN_NATIVE_PI_PROVIDERS`, these are
 * not safe by construction: `cursor` runs its own embedded agent via
 * `streamSimple` that KPM's tool gate cannot see, so it can modify repo files
 * or run commands from chat, outside chat's read-only guarantee (P7). It is
 * listed here because the single user has accepted that tradeoff on their own
 * machine — this entry IS the trust decision, not a claim the provider is
 * gated. Removing `cursor` here restores the "runs its own agent" warning.
 */
const USER_TRUSTED_PI_PROVIDERS = new Set<string>(['cursor']);

/**
 * `true` for providers driven through pi's own native tool loop
 * (`KNOWN_NATIVE_PI_PROVIDERS`) or ones the user has explicitly trusted
 * (`USER_TRUSTED_PI_PROVIDERS`). Everything else — including any provider this
 * module has never heard of — stays `false`, so an unknown provider that ships
 * its own agent runtime still surfaces the warning.
 */
export function isPiProviderSafe(provider: string): boolean {
  return KNOWN_NATIVE_PI_PROVIDERS.has(provider) || USER_TRUSTED_PI_PROVIDERS.has(provider);
}

/**
 * Classify an already-read catalog into the options the model pickers show.
 *
 * A provider that has no models even after extensions load (e.g. a
 * misconfigured credential, or an extension that failed to register any)
 * surfaces as one placeholder entry so the user can see it's configured.
 */
export function buildPiProviderOptions(catalog: PiCatalogSnapshot): PiProviderOption[] {
  const options: PiProviderOption[] = [];
  for (const provider of catalog.credentials) {
    const safe = isPiProviderSafe(provider);
    const displayName = catalog.providerNames[provider] ?? provider;
    const models = catalog.models.filter((model) => model.provider === provider);

    if (models.length === 0) {
      options.push({ provider, modelId: PI_UNRESOLVED_MODEL_ID, label: displayName, safe });
      continue;
    }

    for (const model of models) {
      const contextWindow = modelContextWindow(model);
      options.push({
        provider,
        modelId: model.id,
        modelName: model.name,
        label: `${displayName} — ${model.name}`,
        safe,
        ...(contextWindow ? { contextWindow } : {}),
        ...(`${provider}/${model.id}` === catalog.defaultSelector ? { isDefault: true } : {}),
      });
    }
  }
  return options;
}

/**
 * Enumerate the pi providers/models the user has configured and authenticated,
 * each classified safe/unsafe for KPM's read-only chat.
 *
 * The child process loads global/user pi extensions with the same trust
 * posture as a real chat session, so a provider registered at runtime by an
 * installed extension (e.g. `cursor`, from `pi-cursor-sdk`) surfaces its real
 * models here.
 */
export async function listPiProviders(): Promise<PiProviderOption[]> {
  const catalog = await readPiCatalog();
  // A pi extension whose load fails (e.g. its deps can't be resolved) never
  // registers its provider, so that provider silently collapses to the
  // no-models placeholder — the failure mode that hid the cursor catalog when
  // pi was bundled instead of externalized. pi reports load failures and its
  // own diagnostics separately; surface both rather than dropping them.
  if (catalog.extensionErrors.length > 0) {
    console.warn('[listPiProviders] pi extension load errors:', catalog.extensionErrors);
  }
  if (catalog.diagnostics.length > 0) {
    console.warn('[listPiProviders] pi diagnostics:', catalog.diagnostics);
  }
  return buildPiProviderOptions(catalog);
}
