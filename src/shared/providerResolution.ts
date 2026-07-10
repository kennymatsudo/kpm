import type { ChatProvider, ProvidersReadiness } from './types';
import { CHAT_PROVIDERS } from './types';

export interface EffectiveProvider {
  /** The provider to use, or null when the user should be asked to choose. */
  provider: ChatProvider | null;
  /** True when resolution can't pick unambiguously and the connect step should open. */
  shouldAsk: boolean;
}

function readyProviders(readiness: ProvidersReadiness): ChatProvider[] {
  return CHAT_PROVIDERS.filter((provider) => readiness.byProvider[provider].state === 'ready');
}

/**
 * Resolve which provider KPM should use, without ever favoring a specific one.
 *
 * - A deliberately-stored choice that is ready is preserved.
 * - Otherwise, if exactly one provider is ready, adopt it.
 * - If two or more are ready (and the stored choice isn't usable), ask — KPM
 *   picks nothing among ready peers.
 * - If none are ready, ask (there is nothing to route to yet).
 */
export function resolveEffectiveProvider(
  readiness: ProvidersReadiness,
  storedChoice: ChatProvider | null,
): EffectiveProvider {
  if (storedChoice && readiness.byProvider[storedChoice].state === 'ready') {
    return { provider: storedChoice, shouldAsk: false };
  }
  const ready = readyProviders(readiness);
  if (ready.length === 1) {
    return { provider: ready[0], shouldAsk: false };
  }
  return { provider: null, shouldAsk: true };
}
