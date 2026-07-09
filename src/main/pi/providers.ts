/**
 * pi.dev provider/model enumeration and safe/unsafe classification.
 *
 * Same ESM-only constraint as `PiChatSession.ts`: `@earendil-works/pi-coding-agent`
 * has no `require` export condition, so it is loaded via dynamic `import()`
 * rather than a static import (a static import would compile to a `require()`
 * call in the electron-vite CJS main bundle and throw ERR_PACKAGE_PATH_NOT_EXPORTED
 * at runtime).
 *
 * SAFETY-CRITICAL: `safe` gates whether a provider/model may ever be selected
 * for KPM's read-only main chat (P7). See `isPiProviderSafe` below for the
 * exact signal used and its limits.
 */

import { homedir } from 'os';
import { PI_UNRESOLVED_MODEL_ID, type PiProviderOption } from '../../shared/types';
import { resolvePiProjectTrust } from './PiChatSession';

export type { PiProviderOption };

function modelContextWindow(model: { contextWindow?: unknown }): number | undefined {
  return typeof model.contextWindow === 'number' && Number.isFinite(model.contextWindow) && model.contextWindow > 0
    ? model.contextWindow
    : undefined;
}

/**
 * Providers shipped in pi-ai's own built-in catalog
 * (`@earendil-works/pi-ai`'s `providers/all.js` — verified by reading
 * `node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/models.generated.js`
 * at the time this was written). Every one of these models is driven through
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
 * catalog rather than read from the SDK at runtime — `pi-coding-agent`'s
 * public exports (`index.d.ts`) don't re-export pi-ai's `getBuiltinProviders()`,
 * and `@earendil-works/pi-ai` isn't a direct KPM dependency (only nested under
 * `pi-coding-agent`'s own `node_modules`), so there's no import path that
 * would keep this list in sync automatically. It will silently miss a new
 * built-in provider added in a future `pi-coding-agent` upgrade (that
 * provider would default to `safe: false`, the conservative direction) and,
 * more importantly, would NOT catch a future built-in provider that itself
 * ships an embedded agent runtime — this allowlist trusts "built into pi-ai"
 * as a proxy for "drives its native tool loop," which holds for every
 * provider verified above but is not a guarantee. It also does not catch a
 * malicious/buggy locally-installed pi extension that calls
 * `registerProvider()` under an already-known-native provider name (out of
 * scope: KPM already trusts the user's local pi installation and its
 * extensions, the same trust boundary as Claude Code's local extensions).
 * Re-verify this list against `models.generated.js` on every
 * `@earendil-works/pi-coding-agent` version bump.
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
 * Enumerate the pi providers/models the user has configured and authenticated,
 * each classified safe/unsafe for KPM's read-only chat.
 *
 * Loads global/user pi extensions the same way `PiChatSession.ts`'s
 * `createRealPiSession` does (`noExtensions: false`, `resolveProjectTrust`
 * always denying — see `resolvePiProjectTrust`), via `createAgentSessionServices`
 * — the SDK's helper for building `resourceLoader`/`modelRegistry` without
 * constructing a live `AgentSession`. This runs each loaded extension's own
 * module code (e.g. `pi-cursor-sdk`, already a trusted local install — see
 * `KNOWN_NATIVE_PI_PROVIDERS` above) so it can register its declared models
 * (e.g. `cursor`) into the model registry, but makes no model/completion
 * calls itself. `cwd` is irrelevant to the result: `resolveProjectTrust`
 * always denies project trust, so no `<cwd>/.pi/` resource is ever read
 * regardless of which directory is passed — `homedir()` is used simply
 * because some directory is required.
 *
 * A provider that still has no models after extensions load (e.g. a
 * misconfigured credential, or an extension that failed to register any)
 * surfaces as one placeholder entry so the user can see it's configured.
 */
export async function listPiProviders(): Promise<PiProviderOption[]> {
  const pi = await import('@earendil-works/pi-coding-agent');
  const authStorage = pi.AuthStorage.create();
  const configuredProviders = authStorage.list();
  if (configuredProviders.length === 0) return [];

  const { modelRegistry, diagnostics, resourceLoader } = await pi.createAgentSessionServices({
    cwd: homedir(),
    authStorage,
    resourceLoaderOptions: {
      noExtensions: false,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    },
    resourceLoaderReloadOptions: { resolveProjectTrust: resolvePiProjectTrust },
  });
  // A pi extension whose load fails (e.g. its deps can't be resolved) never
  // registers its provider, so that provider silently collapses to the
  // no-models placeholder below — the failure mode that hid the cursor catalog
  // when pi was bundled instead of externalized. Extension load errors live on
  // `getExtensions().errors`, distinct from the services `diagnostics`; surface
  // both rather than dropping them.
  const extensionErrors = resourceLoader.getExtensions().errors;
  if (extensionErrors.length > 0) {
    console.warn('[listPiProviders] pi extension load errors:', extensionErrors);
  }
  if (diagnostics.length > 0) {
    console.warn('[listPiProviders] pi diagnostics:', diagnostics);
  }
  const availableModels = modelRegistry.getAvailable();

  const options: PiProviderOption[] = [];
  for (const provider of configuredProviders) {
    const safe = isPiProviderSafe(provider);
    const displayName = modelRegistry.getProviderDisplayName(provider);
    const models = availableModels.filter((model) => model.provider === provider);

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
      });
    }
  }
  return options;
}
