import { describe, expect, it } from 'vitest';
import type { ChatProvider, ProviderReadinessState, ProvidersReadiness } from './types';
import { CHAT_PROVIDERS } from './types';
import { resolveEffectiveProvider } from './providerResolution';

function readiness(states: Partial<Record<ChatProvider, ProviderReadinessState>>): ProvidersReadiness {
  const byProvider = Object.fromEntries(
    CHAT_PROVIDERS.map((provider) => {
      const state = states[provider] ?? 'not-installed';
      return [provider, { provider, state, detail: state }];
    }),
  ) as ProvidersReadiness['byProvider'];
  const anyReady = CHAT_PROVIDERS.some((provider) => byProvider[provider].state === 'ready');
  return { byProvider, anyReady };
}

describe('resolveEffectiveProvider', () => {
  it('preserves a stored choice that is ready', () => {
    const result = resolveEffectiveProvider(readiness({ claude: 'ready', codex: 'ready' }), 'codex');
    expect(result).toEqual({ provider: 'codex', shouldAsk: false });
  });

  it('adopts the single ready provider when the stored choice is not ready', () => {
    const result = resolveEffectiveProvider(
      readiness({ claude: 'installed-not-configured', codex: 'ready' }),
      'claude',
    );
    expect(result).toEqual({ provider: 'codex', shouldAsk: false });
  });

  it('adopts the single ready provider when there is no stored choice', () => {
    const result = resolveEffectiveProvider(readiness({ pi: 'ready' }), null);
    expect(result).toEqual({ provider: 'pi', shouldAsk: false });
  });

  it('asks when two or more are ready and the stored choice is not usable', () => {
    const result = resolveEffectiveProvider(readiness({ claude: 'ready', codex: 'ready' }), null);
    expect(result).toEqual({ provider: null, shouldAsk: true });
  });

  it('asks when the stored choice is not ready and multiple others are', () => {
    const result = resolveEffectiveProvider(
      readiness({ claude: 'not-installed', codex: 'ready', pi: 'ready' }),
      'claude',
    );
    expect(result).toEqual({ provider: null, shouldAsk: true });
  });

  it('asks when nothing is ready', () => {
    const result = resolveEffectiveProvider(readiness({}), 'claude');
    expect(result).toEqual({ provider: null, shouldAsk: true });
  });

  it('never favors claude when multiple are ready and none chosen', () => {
    // The two-ready case must not silently pick claude — it must defer.
    const result = resolveEffectiveProvider(readiness({ claude: 'ready', pi: 'ready' }), null);
    expect(result.provider).toBeNull();
    expect(result.shouldAsk).toBe(true);
  });
});
