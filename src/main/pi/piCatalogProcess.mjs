/**
 * Enumerates the user's pi providers and models in a throwaway child process,
 * and prints the result to stdout wrapped in a caller-supplied marker.
 *
 * This runs out of process because loading pi extensions mutates
 * process-global state that a live chat session depends on. `pi-cursor-sdk`
 * keeps its pi-tool bridge in a module-level singleton and rebuilds it on
 * every extension load; a load that never becomes an `AgentSession` leaves
 * that singleton pointing at an unbound extension runtime, and every
 * subsequent turn of an already-running session dies with "Extension runtime
 * not initialized". See `readPiCatalog` in `piCatalog.ts`.
 *
 * Deliberately imports nothing from KPM: this file ships to `dist/main`
 * verbatim (see the copy step in `electron.vite.config.ts`) so it stays plain
 * ESM that `ELECTRON_RUN_AS_NODE` can execute directly. Every policy decision
 * — project trust, which providers count as safe — belongs to the parent.
 */

const options = JSON.parse(process.argv[2] ?? '{}');

// Mirrors pi-ai's `getSupportedThinkingLevels`, which pi-coding-agent does not
// re-export: a non-reasoning model has only "off", a null map entry marks a
// level unsupported, and xhigh/max exist only when the map names them.
const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
function supportedThinkingLevels(model) {
  if (!model.reasoning) return ['off'];
  return THINKING_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];
    if (mapped === null) return false;
    if (level === 'xhigh' || level === 'max') return mapped !== undefined;
    return true;
  });
}

// The level pi itself starts this model on (AgentSession's model-switch rule),
// so KPM's picker opens on the same level instead of a guess.
function startingThinkingLevel(settingsManager, model, supported) {
  const preferred = settingsManager.getModelThinkingLevel(model.provider, model.id)
    ?? settingsManager.getDefaultThinkingLevel()
    ?? 'medium';
  return supported.includes(preferred) ? preferred : undefined;
}

function fail(error) {
  process.stderr.write(error instanceof Error ? `${error.message}\n` : `${String(error)}\n`);
  process.exit(1);
}

try {
  const pi = await import('@earendil-works/pi-coding-agent');
  const { modelRuntime, diagnostics, resourceLoader, settingsManager } = await pi.createAgentSessionServices({
    cwd: options.cwd,
    resourceLoaderOptions: {
      noExtensions: false,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    },
    resourceLoaderReloadOptions: {
      resolveProjectTrust: () => Promise.resolve(options.projectTrusted === true),
    },
  });

  const credentials = (await modelRuntime.listCredentials()).map((credential) => credential.providerId);
  const configured = new Set(credentials);
  const models = (await modelRuntime.getAvailable())
    .filter((model) => configured.has(model.provider))
    .map((model) => {
      const thinkingLevels = supportedThinkingLevels(model);
      const defaultThinkingLevel = startingThinkingLevel(settingsManager, model, thinkingLevels);
      return {
        provider: model.provider,
        id: model.id,
        name: model.name,
        ...(typeof model.contextWindow === 'number' ? { contextWindow: model.contextWindow } : {}),
        thinkingLevels,
        ...(defaultThinkingLevel ? { defaultThinkingLevel } : {}),
      };
    });

  // The model the user's own `pi` CLI would start on, so KPM can offer the
  // same one rather than an arbitrary catalog entry.
  const defaultProvider = settingsManager.getDefaultProvider();
  const defaultModel = settingsManager.getDefaultModel();

  const payload = {
    defaultSelector: defaultProvider && defaultModel ? `${defaultProvider}/${defaultModel}` : null,
    credentials,
    providerNames: Object.fromEntries(
      credentials.map((provider) => [provider, modelRuntime.getProvider(provider)?.name ?? provider]),
    ),
    models,
    extensionErrors: resourceLoader.getExtensions().errors.map((entry) => `${entry.path}: ${entry.error}`),
    diagnostics: diagnostics.map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry))),
  };

  // Extensions log freely to stdout while loading, so the payload is fenced
  // by a marker the parent generated for this run rather than being the whole
  // of stdout. Exit explicitly: extensions leave sockets and servers open.
  process.stdout.write(`${options.marker}${JSON.stringify(payload)}${options.marker}`, () => process.exit(0));
} catch (error) {
  fail(error);
}
