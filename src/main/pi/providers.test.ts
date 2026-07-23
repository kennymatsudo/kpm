import { beforeEach, describe, expect, it, vi } from 'vitest';

const piMocks = vi.hoisted(() => ({
  listCredentials: vi.fn(),
  getAvailable: vi.fn(),
  getProvider: vi.fn((provider: string): { name: string } | undefined => ({ name: provider })),
  createAgentSessionServices: vi.fn(),
}));

vi.mock('@earendil-works/pi-coding-agent', () => ({
  createAgentSessionServices: piMocks.createAgentSessionServices,
}));

import { PI_UNRESOLVED_MODEL_ID } from '../../shared/types';
import { isPiProviderSafe, listPiProviders } from './providers';

describe('isPiProviderSafe', () => {
  it('classifies pi-ai and pi-coding-agent built-in providers as safe', () => {
    expect(isPiProviderSafe('openai-codex')).toBe(true);
    expect(isPiProviderSafe('anthropic')).toBe(true);
    expect(isPiProviderSafe('qwen-token-plan')).toBe(true);
    expect(isPiProviderSafe('llama.cpp')).toBe(true);
  });

  it('classifies a user-trusted extension provider (cursor) as safe', () => {
    // cursor is registered by pi-cursor-sdk and runs its own embedded agent, so
    // it is not native-safe — but the user has explicitly trusted it, so it is
    // no longer flagged. See USER_TRUSTED_PI_PROVIDERS.
    expect(isPiProviderSafe('cursor')).toBe(true);
  });

  it('defaults an unrecognized, untrusted extension provider to unsafe', () => {
    expect(isPiProviderSafe('some-future-provider')).toBe(false);
  });
});

describe('listPiProviders', () => {
  beforeEach(() => {
    piMocks.listCredentials.mockReset();
    piMocks.getAvailable.mockReset();
    piMocks.getProvider.mockReset().mockImplementation((provider: string): { name: string } | undefined => ({ name: provider }));
    piMocks.createAgentSessionServices.mockReset().mockImplementation(async () => ({
      modelRuntime: {
        listCredentials: piMocks.listCredentials,
        getAvailable: piMocks.getAvailable,
        getProvider: piMocks.getProvider,
      },
      resourceLoader: {
        getExtensions: () => ({ extensions: [], errors: [], runtime: { pendingProviderRegistrations: [] } }),
      },
      diagnostics: [],
    }));
  });

  it('loads extensions with the same trust posture as a real chat session', async () => {
    piMocks.listCredentials.mockResolvedValue([{ providerId: 'openai-codex', type: 'oauth' }]);
    piMocks.getAvailable.mockResolvedValue([]);

    await listPiProviders();

    expect(piMocks.createAgentSessionServices).toHaveBeenCalledTimes(1);
    const call = piMocks.createAgentSessionServices.mock.calls[0]?.[0] as {
      resourceLoaderOptions: { noExtensions: boolean };
      resourceLoaderReloadOptions: { resolveProjectTrust: () => Promise<boolean> };
    };
    expect(call.resourceLoaderOptions.noExtensions).toBe(false);
    await expect(call.resourceLoaderReloadOptions.resolveProjectTrust()).resolves.toBe(false);
  });

  it('returns an empty list when the user has nothing configured', async () => {
    piMocks.listCredentials.mockResolvedValue([]);

    expect(await listPiProviders()).toEqual([]);
  });

  it('lists resolved models for a known-native provider as safe', async () => {
    piMocks.listCredentials.mockResolvedValue([{ providerId: 'openai-codex', type: 'oauth' }]);
    piMocks.getAvailable.mockResolvedValue([
      { provider: 'openai-codex', id: 'gpt-5.4', name: 'GPT-5.4' },
      { provider: 'openai-codex', id: 'gpt-5.4-mini', name: 'GPT-5.4 mini' },
    ]);
    piMocks.getProvider.mockReturnValue({ name: 'OpenAI Codex' });

    expect(await listPiProviders()).toEqual([
      { provider: 'openai-codex', modelId: 'gpt-5.4', modelName: 'GPT-5.4', label: 'OpenAI Codex — GPT-5.4', safe: true },
      { provider: 'openai-codex', modelId: 'gpt-5.4-mini', modelName: 'GPT-5.4 mini', label: 'OpenAI Codex — GPT-5.4 mini', safe: true },
    ]);
  });

  it('lists a user-trusted extension provider (cursor) as safe once its models load', async () => {
    // Extensions load during enumeration (mirroring PiChatSession), so a
    // provider registered by an installed extension (e.g. pi-cursor-sdk)
    // surfaces its real models here — cursor is user-trusted, so safe.
    piMocks.listCredentials.mockResolvedValue([{ providerId: 'cursor', type: 'oauth' }]);
    piMocks.getAvailable.mockResolvedValue([
      { provider: 'cursor', id: 'cursor-default', name: 'Cursor Default', contextWindow: 200_000 },
    ]);
    piMocks.getProvider.mockReturnValue({ name: 'cursor' });

    expect(await listPiProviders()).toEqual([
      { provider: 'cursor', modelId: 'cursor-default', modelName: 'Cursor Default', label: 'cursor — Cursor Default', safe: true, contextWindow: 200_000 },
    ]);
  });

  it('surfaces a configured provider with no available models as a single placeholder entry', async () => {
    // Even after extensions load, a provider can end up with no models (e.g.
    // its extension failed to register, or the credential is stale). An
    // unknown, untrusted provider stays unsafe.
    piMocks.listCredentials.mockResolvedValue([{ providerId: 'some-future-provider', type: 'api_key' }]);
    piMocks.getAvailable.mockResolvedValue([]);
    piMocks.getProvider.mockReturnValue(undefined);

    expect(await listPiProviders()).toEqual([
      { provider: 'some-future-provider', modelId: PI_UNRESOLVED_MODEL_ID, label: 'some-future-provider', safe: false },
    ]);
  });

  it('classifies each configured provider independently', async () => {
    piMocks.listCredentials.mockResolvedValue([
      { providerId: 'openai-codex', type: 'oauth' },
      { providerId: 'some-future-provider', type: 'api_key' },
    ]);
    piMocks.getAvailable.mockResolvedValue([
      { provider: 'openai-codex', id: 'gpt-5.4', name: 'GPT-5.4' },
    ]);
    piMocks.getProvider.mockImplementation((provider: string) =>
      provider === 'openai-codex' ? { name: 'OpenAI Codex' } : undefined,
    );

    const options = await listPiProviders();
    expect(options).toEqual([
      { provider: 'openai-codex', modelId: 'gpt-5.4', modelName: 'GPT-5.4', label: 'OpenAI Codex — GPT-5.4', safe: true },
      { provider: 'some-future-provider', modelId: PI_UNRESOLVED_MODEL_ID, label: 'some-future-provider', safe: false },
    ]);
  });
});
