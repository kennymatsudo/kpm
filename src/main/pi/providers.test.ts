import { beforeEach, describe, expect, it, vi } from 'vitest';

const piMocks = vi.hoisted(() => ({
  list: vi.fn(),
  getAvailable: vi.fn(),
  getProviderDisplayName: vi.fn((provider: string) => provider),
  createAgentSessionServices: vi.fn(),
}));

vi.mock('@earendil-works/pi-coding-agent', () => ({
  AuthStorage: {
    create: () => ({ list: piMocks.list }),
  },
  createAgentSessionServices: piMocks.createAgentSessionServices,
}));

import { PI_UNRESOLVED_MODEL_ID } from '../../shared/types';
import { isPiProviderSafe, listPiProviders } from './providers';

describe('isPiProviderSafe', () => {
  it('classifies pi-ai built-in providers as safe', () => {
    expect(isPiProviderSafe('openai-codex')).toBe(true);
    expect(isPiProviderSafe('anthropic')).toBe(true);
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
    piMocks.list.mockReset();
    piMocks.getAvailable.mockReset();
    piMocks.getProviderDisplayName.mockReset().mockImplementation((provider: string) => provider);
    piMocks.createAgentSessionServices.mockReset().mockImplementation(async () => ({
      modelRegistry: {
        getAvailable: piMocks.getAvailable,
        getProviderDisplayName: piMocks.getProviderDisplayName,
      },
      resourceLoader: {
        getExtensions: () => ({ extensions: [], errors: [], runtime: { pendingProviderRegistrations: [] } }),
      },
      diagnostics: [],
    }));
  });

  it('loads extensions with the same trust posture as a real chat session', async () => {
    piMocks.list.mockReturnValue(['openai-codex']);
    piMocks.getAvailable.mockReturnValue([]);

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
    piMocks.list.mockReturnValue([]);

    expect(await listPiProviders()).toEqual([]);
  });

  it('lists resolved models for a known-native provider as safe', async () => {
    piMocks.list.mockReturnValue(['openai-codex']);
    piMocks.getAvailable.mockReturnValue([
      { provider: 'openai-codex', id: 'gpt-5.4', name: 'GPT-5.4' },
      { provider: 'openai-codex', id: 'gpt-5.4-mini', name: 'GPT-5.4 mini' },
    ]);
    piMocks.getProviderDisplayName.mockReturnValue('OpenAI Codex');

    expect(await listPiProviders()).toEqual([
      { provider: 'openai-codex', modelId: 'gpt-5.4', modelName: 'GPT-5.4', label: 'OpenAI Codex — GPT-5.4', safe: true },
      { provider: 'openai-codex', modelId: 'gpt-5.4-mini', modelName: 'GPT-5.4 mini', label: 'OpenAI Codex — GPT-5.4 mini', safe: true },
    ]);
  });

  it('lists a user-trusted extension provider (cursor) as safe once its models load', async () => {
    // Extensions load during enumeration (mirroring PiChatSession), so a
    // provider registered by an installed extension (e.g. pi-cursor-sdk)
    // surfaces its real models here — cursor is user-trusted, so safe.
    piMocks.list.mockReturnValue(['cursor']);
    piMocks.getAvailable.mockReturnValue([
      { provider: 'cursor', id: 'cursor-default', name: 'Cursor Default', contextWindow: 200_000 },
    ]);
    piMocks.getProviderDisplayName.mockReturnValue('cursor');

    expect(await listPiProviders()).toEqual([
      { provider: 'cursor', modelId: 'cursor-default', modelName: 'Cursor Default', label: 'cursor — Cursor Default', safe: true, contextWindow: 200_000 },
    ]);
  });

  it('surfaces a configured provider with no available models as a single placeholder entry', async () => {
    // Even after extensions load, a provider can end up with no models (e.g.
    // its extension failed to register, or the credential is stale). An
    // unknown, untrusted provider stays unsafe.
    piMocks.list.mockReturnValue(['some-future-provider']);
    piMocks.getAvailable.mockReturnValue([]);
    piMocks.getProviderDisplayName.mockReturnValue('some-future-provider');

    expect(await listPiProviders()).toEqual([
      { provider: 'some-future-provider', modelId: PI_UNRESOLVED_MODEL_ID, label: 'some-future-provider', safe: false },
    ]);
  });

  it('classifies each configured provider independently', async () => {
    piMocks.list.mockReturnValue(['openai-codex', 'some-future-provider']);
    piMocks.getAvailable.mockReturnValue([
      { provider: 'openai-codex', id: 'gpt-5.4', name: 'GPT-5.4' },
    ]);
    piMocks.getProviderDisplayName.mockImplementation((provider: string) =>
      provider === 'openai-codex' ? 'OpenAI Codex' : 'some-future-provider',
    );

    const options = await listPiProviders();
    expect(options).toEqual([
      { provider: 'openai-codex', modelId: 'gpt-5.4', modelName: 'GPT-5.4', label: 'OpenAI Codex — GPT-5.4', safe: true },
      { provider: 'some-future-provider', modelId: PI_UNRESOLVED_MODEL_ID, label: 'some-future-provider', safe: false },
    ]);
  });
});
