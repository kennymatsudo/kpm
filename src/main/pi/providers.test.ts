import { describe, expect, it } from 'vitest';

import { PI_UNRESOLVED_MODEL_ID } from '../../shared/types';
import type { PiCatalogSnapshot } from './piCatalog';
import { buildPiProviderOptions, isPiProviderSafe } from './providers';

function catalog(overrides: Partial<PiCatalogSnapshot>): PiCatalogSnapshot {
  return {
    defaultSelector: null,
    credentials: [],
    providerNames: {},
    models: [],
    extensionErrors: [],
    diagnostics: [],
    ...overrides,
  };
}

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

describe('buildPiProviderOptions', () => {
  it('returns an empty list when the user has nothing configured', () => {
    expect(buildPiProviderOptions(catalog({}))).toEqual([]);
  });

  it('lists resolved models for a known-native provider as safe', () => {
    const options = buildPiProviderOptions(catalog({
      credentials: ['openai-codex'],
      providerNames: { 'openai-codex': 'OpenAI Codex' },
      models: [
        { provider: 'openai-codex', id: 'gpt-5.4', name: 'GPT-5.4' },
        { provider: 'openai-codex', id: 'gpt-5.4-mini', name: 'GPT-5.4 mini' },
      ],
    }));

    expect(options).toEqual([
      { provider: 'openai-codex', modelId: 'gpt-5.4', modelName: 'GPT-5.4', label: 'OpenAI Codex — GPT-5.4', safe: true },
      { provider: 'openai-codex', modelId: 'gpt-5.4-mini', modelName: 'GPT-5.4 mini', label: 'OpenAI Codex — GPT-5.4 mini', safe: true },
    ]);
  });

  it('lists a user-trusted extension provider (cursor) as safe with its context window', () => {
    const options = buildPiProviderOptions(catalog({
      credentials: ['cursor'],
      providerNames: { cursor: 'cursor' },
      models: [{ provider: 'cursor', id: 'cursor-default', name: 'Cursor Default', contextWindow: 200_000 }],
    }));

    expect(options).toEqual([
      { provider: 'cursor', modelId: 'cursor-default', modelName: 'Cursor Default', label: 'cursor — Cursor Default', safe: true, contextWindow: 200_000 },
    ]);
  });

  it('marks the model the user\'s own pi CLI defaults to', () => {
    const options = buildPiProviderOptions(catalog({
      defaultSelector: 'openai-codex/gpt-5.4-mini',
      credentials: ['openai-codex'],
      providerNames: { 'openai-codex': 'OpenAI Codex' },
      models: [
        { provider: 'openai-codex', id: 'gpt-5.4', name: 'GPT-5.4' },
        { provider: 'openai-codex', id: 'gpt-5.4-mini', name: 'GPT-5.4 mini' },
      ],
    }));

    expect(options.map((option) => [option.modelId, option.isDefault])).toEqual([
      ['gpt-5.4', undefined],
      ['gpt-5.4-mini', true],
    ]);
  });

  it('marks nothing as default when pi has no default of its own', () => {
    const options = buildPiProviderOptions(catalog({
      credentials: ['openai-codex'],
      models: [{ provider: 'openai-codex', id: 'gpt-5.4', name: 'GPT-5.4' }],
    }));

    expect(options.every((option) => option.isDefault === undefined)).toBe(true);
  });

  it('surfaces a configured provider with no available models as a single placeholder entry', () => {
    // Even after extensions load, a provider can end up with no models (e.g.
    // its extension failed to register, or the credential is stale). An
    // unknown, untrusted provider stays unsafe.
    const options = buildPiProviderOptions(catalog({ credentials: ['some-future-provider'] }));

    expect(options).toEqual([
      { provider: 'some-future-provider', modelId: PI_UNRESOLVED_MODEL_ID, label: 'some-future-provider', safe: false },
    ]);
  });

  it('classifies each configured provider independently', () => {
    const options = buildPiProviderOptions(catalog({
      credentials: ['openai-codex', 'some-future-provider'],
      providerNames: { 'openai-codex': 'OpenAI Codex' },
      models: [{ provider: 'openai-codex', id: 'gpt-5.4', name: 'GPT-5.4' }],
    }));

    expect(options).toEqual([
      { provider: 'openai-codex', modelId: 'gpt-5.4', modelName: 'GPT-5.4', label: 'OpenAI Codex — GPT-5.4', safe: true },
      { provider: 'some-future-provider', modelId: PI_UNRESOLVED_MODEL_ID, label: 'some-future-provider', safe: false },
    ]);
  });
});
