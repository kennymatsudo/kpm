import { useEffect } from 'react';
import { SettingsSection, StatusBadge } from './SettingsSection';
import { useClaudeAvailabilityStore, useProviderReadinessStore } from '../../stores';
import {
  CHAT_PROVIDERS,
  type ChatProvider,
  type ProviderReadiness,
  type ProviderReadinessState,
} from '../../../shared/types';

const PROVIDER_LABELS: Record<ChatProvider, string> = {
  claude: 'Claude',
  codex: 'Codex',
  pi: 'pi',
};

const DOT_BY_STATE: Record<ProviderReadinessState, string> = {
  ready: 'bg-success',
  'installed-not-configured': 'bg-warning',
  'not-installed': 'bg-text-muted',
};

function stateBadge(state: ProviderReadinessState): React.ReactNode {
  if (state === 'ready') return <StatusBadge variant="success">Ready</StatusBadge>;
  if (state === 'installed-not-configured') return <StatusBadge variant="warning">Sign in required</StatusBadge>;
  return <StatusBadge variant="muted">Not found</StatusBadge>;
}

export function ProvidersSettings() {
  const { availability, load: loadClaude, refresh: refreshClaude } = useClaudeAvailabilityStore();
  const {
    readiness,
    isLoading,
    error,
    load: loadReadiness,
    refresh: refreshReadiness,
  } = useProviderReadinessStore();

  useEffect(() => {
    if (!readiness && !isLoading) void loadReadiness();
    if (!availability) void loadClaude();
  }, [readiness, isLoading, loadReadiness, availability, loadClaude]);

  const recheck = () => {
    void refreshReadiness();
    void refreshClaude();
  };

  const total = CHAT_PROVIDERS.length;
  const readyCount = readiness
    ? CHAT_PROVIDERS.filter((provider) => readiness.byProvider[provider].state === 'ready').length
    : 0;

  const badge = readiness
    ? <StatusBadge variant={readyCount > 0 ? 'success' : 'warning'}>{readyCount}/{total} ready</StatusBadge>
    : <StatusBadge variant="muted">Checking…</StatusBadge>;

  const claudePathFallback =
    availability?.status === 'path-fallback' ? availability : null;

  return (
    <SettingsSection
      icon={
        <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
        </svg>
      }
      title="AI providers"
      description="Agents that power chat, board execution, and generation. Sign in to each on your machine."
      collapsible={false}
      statusBadge={badge}
    >
      <div className="space-y-2">
        {CHAT_PROVIDERS.map((provider) => (
          <ProviderRow
            key={provider}
            provider={provider}
            entry={readiness?.byProvider[provider] ?? null}
            pathFallback={provider === 'claude' ? claudePathFallback : null}
          />
        ))}

        {error && <p className="text-xs text-danger">Status check failed: {error}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={recheck}
            disabled={isLoading}
            className="text-xs text-accent hover:underline disabled:opacity-50"
          >
            {isLoading ? 'Checking…' : 'Recheck'}
          </button>
        </div>
      </div>
    </SettingsSection>
  );
}

function ProviderRow({
  provider,
  entry,
  pathFallback,
}: {
  provider: ChatProvider;
  entry: ProviderReadiness | null;
  pathFallback: { binaryPath: string; reason: string } | null;
}) {
  const state = entry?.state;
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border-subtle bg-surface-2/60 px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${state ? DOT_BY_STATE[state] : 'bg-text-muted'}`} />
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-text-primary">{PROVIDER_LABELS[provider]}</p>
          <p className="text-xs text-text-muted">{entry ? entry.detail : 'Checking…'}</p>
          {pathFallback && (
            <div className="mt-1 rounded-md bg-warning-muted/40 px-2 py-1 text-xs text-text-secondary">
              <p className="font-medium text-text-primary">Using claude on your PATH</p>
              <p className="mt-0.5 break-all text-text-muted">{pathFallback.binaryPath}</p>
            </div>
          )}
        </div>
      </div>
      {state && <div className="shrink-0">{stateBadge(state)}</div>}
    </div>
  );
}
