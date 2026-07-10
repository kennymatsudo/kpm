/**
 * Aggregates whether each chat provider (claude, codex, pi) is usable right now
 * into one normalized shape, so callers don't have to know that the three
 * underlying checks are heterogeneous (claude: sync binary probe + a separate
 * sign-in file read; codex: async {installed, authenticated}; pi: async boolean).
 *
 * Readiness is presence-and-shape only — no token value is ever read. The result
 * is cached; `refreshProviderReadiness` re-reads every source, including punching
 * through pi's and Claude's own caches, so the connect step reflects a fresh
 * `codex login` / `pi auth` / `/login`.
 */

import type {
  ChatProvider,
  ProviderReadiness,
  ProviderReadinessState,
  ProvidersReadiness,
} from '../../shared/types';
import { CHAT_PROVIDERS } from '../../shared/types';
import { getClaudeAvailability, refreshClaudeAvailability } from '../claude/availabilityState';
import { detectClaudeSignIn } from '../claude/authState';
import { getCodexStatus } from '../codex/auth';
import { isPiAvailable } from '../pi/detect';

interface ProviderProbe {
  provider: ChatProvider;
  probe(forceRefresh: boolean): Promise<ProviderReadiness>;
}

function readiness(
  provider: ChatProvider,
  state: ProviderReadinessState,
  detail: string,
): ProviderReadiness {
  return { provider, state, detail };
}

const claudeProbe: ProviderProbe = {
  provider: 'claude',
  async probe(forceRefresh) {
    const availability = forceRefresh ? refreshClaudeAvailability() : getClaudeAvailability();
    if (availability.status === 'unreachable') {
      return readiness('claude', 'not-installed', 'Claude Code not found');
    }
    const signIn = await detectClaudeSignIn();
    if (!signIn.signedIn) {
      return readiness('claude', 'installed-not-configured', 'Run /login in Claude Code');
    }
    return readiness('claude', 'ready', signIn.email ? `Signed in as ${signIn.email}` : 'Signed in');
  },
};

const codexProbe: ProviderProbe = {
  provider: 'codex',
  async probe() {
    const status = await getCodexStatus();
    if (!status.installed) {
      return readiness('codex', 'not-installed', 'Codex not found');
    }
    return status.authenticated
      ? readiness('codex', 'ready', 'Signed in')
      : readiness('codex', 'installed-not-configured', 'Run codex login');
  },
};

const piProbe: ProviderProbe = {
  provider: 'pi',
  async probe(forceRefresh) {
    const available = await isPiAvailable(forceRefresh);
    return available
      ? readiness('pi', 'ready', 'Configured')
      : readiness('pi', 'installed-not-configured', 'Run pi auth');
  },
};

const PROBES: readonly ProviderProbe[] = [claudeProbe, codexProbe, piProbe];

let cached: ProvidersReadiness | null = null;

async function computeReadiness(forceRefresh: boolean): Promise<ProvidersReadiness> {
  const results = await Promise.all(PROBES.map((p) => p.probe(forceRefresh)));
  const byProvider = Object.fromEntries(
    results.map((r) => [r.provider, r]),
  ) as Record<ChatProvider, ProviderReadiness>;
  const anyReady = CHAT_PROVIDERS.some((provider) => byProvider[provider].state === 'ready');
  return { byProvider, anyReady };
}

export async function getProviderReadiness(): Promise<ProvidersReadiness> {
  if (!cached) {
    cached = await computeReadiness(false);
  }
  return cached;
}

export async function refreshProviderReadiness(): Promise<ProvidersReadiness> {
  cached = await computeReadiness(true);
  return cached;
}
