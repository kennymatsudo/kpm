import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type {
  ChatChoiceIntent,
  ChatChoiceView,
  PiProviderOption,
} from '../../../shared/types';
import { useChatStore } from '../../stores/chat';
import { getPiOptionDisplay, piProviderModelSelector } from '../../stores/chat/piProviderSelection';
import { CheckIcon } from '../icons/CheckIcon';
import { WarningTriangleIcon } from '../icons/WarningTriangleIcon';
import { ConfirmActionDialog } from '../ui/ConfirmActionDialog';
import {
  Select,
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';
import { Tooltip } from '../ui/Tooltip';

interface ChatChoiceControlsProps {
  readonly choice: ChatChoiceView;
  readonly disabled?: boolean;
  readonly ariaLabelPrefix?: string;
  readonly className?: string;
  readonly onChange: (intent: ChatChoiceIntent) => void | Promise<void>;
}

interface ChoiceOption {
  readonly value: string;
  readonly label: string;
  readonly detail?: string;
  readonly available?: boolean;
}

interface ChoiceSelectProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly ChoiceOption[];
  readonly disabled: boolean;
  readonly className?: string;
  readonly onChange: (value: string) => void;
}

function ChevronIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
      <path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChoiceSelect({
  label,
  value,
  options,
  disabled,
  className = '',
  onChange,
}: ChoiceSelectProps) {
  const selected = options.find((option) => option.value === value);
  const selectedUnavailable = selected?.available === false;

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        aria-label={label}
        title={selected?.detail ? `${selected.label} — ${selected.detail}` : selected?.label}
        className={`group inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium outline-none transition-colors
          border-border-subtle bg-surface-1 text-text-secondary
          hover:border-border-default hover:bg-surface-2 hover:text-text-primary
          focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20
          data-[state=open]:border-border-strong data-[state=open]:bg-surface-selected data-[state=open]:text-text-primary
          disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      >
        {selectedUnavailable ? <WarningTriangleIcon className="h-3.5 w-3.5 shrink-0 text-warning" /> : null}
        <SelectValue>
          <span className="block min-w-0 truncate">{selected?.label ?? value}</span>
        </SelectValue>
        <SelectIcon className="ml-auto shrink-0 text-text-muted transition-transform group-data-[state=open]:rotate-180">
          <ChevronIcon />
        </SelectIcon>
      </SelectTrigger>

      <SelectContent side="top" align="start" sideOffset={8} className="min-w-48 max-w-72">
        <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </div>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.available === false && option.value !== value}
            className="relative min-h-9 rounded-lg px-2.5 py-1.5"
          >
            <SelectItemText>
              <span className="flex min-w-0 flex-col pr-7 leading-tight">
                <span className={`truncate text-xs font-medium ${option.available === false ? 'text-text-muted' : 'text-text-primary'}`}>
                  {option.label}
                </span>
                {option.detail ? <span className="mt-0.5 truncate text-[10px] text-text-muted">{option.detail}</span> : null}
              </span>
            </SelectItemText>
            <SelectItemIndicator className="absolute right-2.5 inline-flex items-center text-accent">
              <CheckIcon className="h-3.5 w-3.5" />
            </SelectItemIndicator>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ChatChoiceControls({
  choice,
  disabled = false,
  ariaLabelPrefix = 'Chat',
  className = '',
  onChange,
}: ChatChoiceControlsProps) {
  const [pendingUnsafeOption, setPendingUnsafeOption] = useState<PiProviderOption | null>(null);
  const {
    piProviders,
    acknowledgedUnsafeProviders,
    acknowledgeUnsafePiProvider,
  } = useChatStore(useShallow((state) => ({
    piProviders: state.piProviders,
    acknowledgedUnsafeProviders: state.piAcknowledgedUnsafeProviders,
    acknowledgeUnsafePiProvider: state.acknowledgeUnsafePiProvider,
  })));

  const provider = choice.providers.find((candidate) => candidate.provider === choice.selected.provider);
  const model = provider?.models.find((candidate) => candidate.id === choice.selected.model);
  const controlsDisabled = disabled || !choice.controlsEnabled;

  const providerOptions: ChoiceOption[] = choice.providers.map((candidate) => ({
    value: candidate.provider,
    label: candidate.label,
    detail: candidate.available ? undefined : candidate.detail,
    available: candidate.available,
  }));

  const modelOptions: ChoiceOption[] = (provider?.models ?? []).map((candidate) => {
    const piOption = choice.selected.provider === 'pi'
      ? piProviders.find((option) => piProviderModelSelector(option) === candidate.id)
      : undefined;
    const piDisplay = piOption ? getPiOptionDisplay(piOption) : null;
    return {
      value: candidate.id,
      label: piDisplay?.primary ?? candidate.label,
      detail: candidate.available
        ? piDisplay?.secondary
        : candidate.unavailableReason,
      available: candidate.available,
    };
  });

  const effortOptions: ChoiceOption[] = (model?.effortLevels ?? []).map((level) => ({
    value: level.value,
    label: level.label,
  }));

  const selectModel = (nextModel: string) => {
    if (choice.selected.provider === 'pi') {
      const option = piProviders.find((candidate) => piProviderModelSelector(candidate) === nextModel);
      if (option && !option.safe && !acknowledgedUnsafeProviders.has(option.provider)) {
        setPendingUnsafeOption(option);
        return;
      }
    }
    void onChange({ type: 'choose_model', model: nextModel });
  };

  return (
    <>
      <div className={`inline-flex min-w-0 items-center gap-1 rounded-lg border border-border-subtle bg-surface-0/70 p-0.5 ${className}`}>
        <ChoiceSelect
          label={`${ariaLabelPrefix} provider`}
          value={choice.selected.provider}
          options={providerOptions}
          disabled={controlsDisabled}
          className="max-w-24"
          onChange={(nextProvider) => void onChange({
            type: 'choose_provider',
            provider: nextProvider as ChatChoiceView['selected']['provider'],
          })}
        />
        <ChoiceSelect
          label={`${ariaLabelPrefix} model`}
          value={choice.selected.model}
          options={modelOptions}
          disabled={controlsDisabled}
          className="max-w-48"
          onChange={selectModel}
        />
        {model && effortOptions.length > 0 ? (
          <ChoiceSelect
            label={`${ariaLabelPrefix} effort`}
            value={choice.selected.effort ?? model.defaultEffort ?? ''}
            options={effortOptions}
            disabled={controlsDisabled}
            className="max-w-28"
            onChange={(effort) => void onChange({
              type: 'choose_effort',
              effort: effort as NonNullable<ChatChoiceView['selected']['effort']>,
            })}
          />
        ) : null}
        {!choice.send.allowed ? (
          <Tooltip content={choice.send.reason ?? 'Choose an available model before sending.'} side="top">
            <span
              role="status"
              aria-label={choice.send.reason ?? 'Chat model unavailable'}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-warning"
            >
              <WarningTriangleIcon className="h-3.5 w-3.5" />
            </span>
          </Tooltip>
        ) : null}
      </div>

      {pendingUnsafeOption ? (
        <ConfirmActionDialog
          title="Enable an unsafe pi.dev provider?"
          message={`${pendingUnsafeOption.label} runs its own agent and can modify repo files or run commands from chat. KPM cannot prevent this.`}
          dialogId="chat-choice-unsafe-provider-dialog"
          onCancel={() => setPendingUnsafeOption(null)}
          action={{
            label: 'Enable anyway',
            loadingText: 'Enabling...',
            variant: 'danger',
            ariaLabel: `Acknowledge and enable ${pendingUnsafeOption.label}`,
            onClick: async () => {
              await acknowledgeUnsafePiProvider(pendingUnsafeOption.provider);
              await onChange({ type: 'choose_model', model: piProviderModelSelector(pendingUnsafeOption) });
              setPendingUnsafeOption(null);
            },
          }}
        />
      ) : null}
    </>
  );
}
