import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SettingsSection, StatusBadge } from './SettingsSection';
import { useChatStore, useProviderReadinessStore, type ChatProvider } from '../../stores';
import { CODEX_CHAT_MODELS, type PiProviderOption } from '../../../shared/types';
import { ConfirmActionDialog } from '../ui/ConfirmActionDialog';
import { piProviderModelSelector } from '../../stores/chat/piProviderSelection';

const PROVIDERS: { value: ChatProvider; label: string; description: string }[] = [
  { value: 'claude', label: 'Claude', description: 'Fast, balanced coding agent' },
  { value: 'codex', label: 'Codex', description: "OpenAI's coding agent" },
  { value: 'pi', label: 'pi', description: 'Bring your own provider' },
];

export function ChatProviderSettings() {
  const { provider, model, codexModel, effort, piProviders, piProviderModel, acknowledgedUnsafeProviders, setDefaultProvider, setDefaultModel, setDefaultCodexModel, setDefaultEffort, setDefaultPiProviderModel, acknowledgeUnsafePiProvider, loadPiProviders } = useChatStore(
    useShallow((state) => ({
      provider: state.provider,
      model: state.model,
      codexModel: state.codexModel,
      effort: state.effort,
      piProviders: state.piProviders,
      piProviderModel: state.piProviderModel,
      acknowledgedUnsafeProviders: state.piAcknowledgedUnsafeProviders,
      setDefaultProvider: state.setDefaultProvider,
      setDefaultModel: state.setDefaultModel,
      setDefaultCodexModel: state.setDefaultCodexModel,
      setDefaultEffort: state.setDefaultEffort,
      setDefaultPiProviderModel: state.setDefaultPiProviderModel,
      acknowledgeUnsafePiProvider: state.acknowledgeUnsafePiProvider,
      loadPiProviders: state.loadPiProviders,
    })),
  );
  const [pendingUnsafeOption, setPendingUnsafeOption] = useState<PiProviderOption | null>(null);
  const readiness = useProviderReadinessStore((state) => state.readiness);
  const isLoadingReadiness = useProviderReadinessStore((state) => state.isLoading);
  const loadReadiness = useProviderReadinessStore((state) => state.load);

  useEffect(() => {
    if (!readiness && !isLoadingReadiness) void loadReadiness();
  }, [readiness, isLoadingReadiness, loadReadiness]);

  useEffect(() => {
    if (provider === 'pi') void loadPiProviders();
  }, [provider, loadPiProviders]);

  const selectDefaultPiOption = (option: PiProviderOption) => {
    if (!option.safe && !acknowledgedUnsafeProviders.has(option.provider)) {
      setPendingUnsafeOption(option);
      return;
    }
    setDefaultPiProviderModel(piProviderModelSelector(option));
  };

  const activeLabel = PROVIDERS.find((option) => option.value === provider)?.label ?? provider;
  const providerRequirement = (value: ChatProvider): { disabled: boolean; detail: string | null } => {
    if (!readiness) return { disabled: false, detail: 'Checking requirements…' };
    const entry = readiness.byProvider[value];
    if (entry.state === 'ready') return { disabled: false, detail: null };
    return { disabled: true, detail: entry.detail };
  };

  const handleProviderSelect = (nextProvider: ChatProvider) => {
    const requirement = providerRequirement(nextProvider);
    if (requirement.disabled) return;
    setDefaultProvider(nextProvider);
  };

  return (
    <SettingsSection
      icon={
        <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" />
        </svg>
      }
      title="Chat provider"
      description="Choose the provider inherited by future chats."
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

        {provider === 'claude' && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-text-muted">Default model
              <select value={model} onChange={(event) => setDefaultModel(event.target.value as typeof model)} className="mt-1 block w-full rounded-md bg-surface-2 p-2 text-text-primary">
                <option value="sonnet">Sonnet</option><option value="opus">Opus</option>
              </select>
            </label>
            <label className="text-xs text-text-muted">Default effort
              <select value={effort} onChange={(event) => setDefaultEffort(event.target.value as typeof effort)} className="mt-1 block w-full rounded-md bg-surface-2 p-2 text-text-primary">
                {(['low', 'medium', 'high', 'max'] as const).map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
        )}
        {provider === 'codex' && (
          <label className="block text-xs text-text-muted">Default model
            <select value={codexModel} onChange={(event) => setDefaultCodexModel(event.target.value as typeof codexModel)} className="mt-1 block w-full rounded-md bg-surface-2 p-2 text-text-primary">
              {CODEX_CHAT_MODELS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        )}
        {provider === 'pi' && (
          <label className="block text-xs text-text-muted">Default provider and model
            <select
              value={piProviderModel ?? ''}
              onChange={(event) => {
                const option = piProviders.find((candidate) => piProviderModelSelector(candidate) === event.target.value);
                if (option) selectDefaultPiOption(option);
              }}
              className="mt-1 block w-full rounded-md bg-surface-2 p-2 text-text-primary"
            >
              <option value="" disabled>Select a model</option>
              {piProviders.map((option) => {
                const selector = piProviderModelSelector(option);
                return <option key={selector} value={selector}>{option.label}{option.safe ? '' : ' — unsafe'}</option>;
              })}
            </select>
          </label>
        )}
        {pendingUnsafeOption && (
          <ConfirmActionDialog
            title="Enable an unsafe pi.dev provider?"
            message={`${pendingUnsafeOption.label} runs its own agent and can modify repo files or run commands from chat. KPM cannot prevent this.`}
            dialogId="settings-pi-unsafe-provider-dialog"
            onCancel={() => setPendingUnsafeOption(null)}
            action={{
              label: 'Enable anyway',
              loadingText: 'Enabling...',
              variant: 'danger',
              ariaLabel: `Acknowledge and enable ${pendingUnsafeOption.label}`,
              onClick: async () => {
                await acknowledgeUnsafePiProvider(pendingUnsafeOption.provider);
                setDefaultPiProviderModel(piProviderModelSelector(pendingUnsafeOption));
                setPendingUnsafeOption(null);
              },
            }}
          />
        )}
      </div>
    </SettingsSection>
  );
}
