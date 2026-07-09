import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SettingsSection, StatusBadge } from './SettingsSection';
import { useChatStore, useClaudeAvailabilityStore, type ChatProvider } from '../../stores';
import { getCodexStatus } from '../../services/settingsService';
import type { CodexStatus } from '../../../shared/types';

const PROVIDERS: { value: ChatProvider; label: string; description: string }[] = [
  { value: 'claude', label: 'Claude', description: 'Fast, balanced coding agent' },
  { value: 'codex', label: 'Codex', description: "OpenAI's coding agent" },
  { value: 'pi', label: 'pi', description: 'Bring your own provider' },
];

export function ChatProviderSettings() {
  const { viewedSessionId, hasViewedSession, provider, piProvidersAvailable, piProvidersLoaded, loadPiProviders, setDefaultProvider, setProvider } = useChatStore(
    useShallow((state) => {
      const viewedSession = state.viewedSessionId
        ? state.sessions.get(state.viewedSessionId) ?? null
        : null;
      return {
        viewedSessionId: state.viewedSessionId,
        hasViewedSession: viewedSession !== null,
        provider: viewedSession?.provider ?? state.provider,
        piProvidersAvailable: state.piProvidersAvailable,
        piProvidersLoaded: state.piProvidersLoaded,
        loadPiProviders: state.loadPiProviders,
        setDefaultProvider: state.setDefaultProvider,
        setProvider: state.setProvider,
      };
    }),
  );
  const claudeAvailability = useClaudeAvailabilityStore((state) => state.availability);
  const [codexStatus, setCodexStatus] = useState<CodexStatus | null>(null);

  useEffect(() => {
    void loadPiProviders();
    let cancelled = false;
    void getCodexStatus().then((result) => {
      if (cancelled || !result.success) return;
      setCodexStatus({ installed: result.installed, authenticated: result.authenticated });
    });
    return () => {
      cancelled = true;
    };
  }, [loadPiProviders]);

  const activeLabel = PROVIDERS.find((option) => option.value === provider)?.label ?? provider;
  const providerRequirement = (value: ChatProvider): { disabled: boolean; detail: string | null } => {
    if (value === 'claude') {
      if (claudeAvailability?.status !== 'unreachable') return { disabled: false, detail: null };
      return { disabled: true, detail: 'Claude Code unavailable' };
    }
    if (value === 'codex') {
      if (!codexStatus) return { disabled: false, detail: 'Checking requirements…' };
      if (!codexStatus.authenticated) return { disabled: true, detail: 'Run codex login first' };
      return { disabled: false, detail: null };
    }
    if (!piProvidersLoaded) return { disabled: false, detail: 'Checking requirements…' };
    if (!piProvidersAvailable) return { disabled: true, detail: 'Run pi auth first' };
    return { disabled: false, detail: null };
  };

  const handleProviderSelect = (nextProvider: ChatProvider) => {
    const requirement = providerRequirement(nextProvider);
    if (requirement.disabled) return;
    if (viewedSessionId && hasViewedSession) {
      setProvider(viewedSessionId, nextProvider);
    } else {
      setDefaultProvider(nextProvider);
    }
  };

  return (
    <SettingsSection
      icon={
        <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" />
        </svg>
      }
      title="Chat provider"
      description="Choose which AI agent powers the active chat and new chats."
      collapsible={false}
      statusBadge={<StatusBadge variant="muted">{activeLabel}</StatusBadge>}
    >
      <div className="space-y-2.5">
        <div role="radiogroup" aria-label="Chat provider" className="grid grid-cols-3 gap-2">
          {PROVIDERS.map((option) => {
            const isSelected = provider === option.value;
            const requirement = providerRequirement(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={requirement.disabled}
                onClick={() => handleProviderSelect(option.value)}
                className={`
                  relative rounded-lg border px-3 py-2.5 text-left transition-colors duration-150
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-accent
                  ${requirement.disabled
                    ? 'cursor-not-allowed border-border-subtle bg-surface-2/40 opacity-60'
                    : isSelected
                      ? 'border-accent bg-accent-subtle'
                      : 'border-border-subtle bg-surface-2/60 hover:border-border-default hover:bg-surface-3/50'
                  }
                `}
              >
                {isSelected && (
                  <svg className="absolute top-2 right-2 w-3.5 h-3.5 text-accent" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.79 6.79-6.79a1 1 0 011.42 0z" clipRule="evenodd" />
                  </svg>
                )}
                <span className={`block text-sm font-medium ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
                  {option.label}
                </span>
                <span className="mt-0.5 block text-xs text-text-muted">{option.description}</span>
                {requirement.detail && (
                  <span className="mt-1 block text-xs text-text-muted">{requirement.detail}</span>
                )}
              </button>
            );
          })}
        </div>

        {provider === 'pi' && (
          <p className="text-xs text-text-muted">Pick the pi backend and model from the chat input.</p>
        )}
      </div>
    </SettingsSection>
  );
}
