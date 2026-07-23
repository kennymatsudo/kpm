import {
  CODEX_CHAT_MODELS,
  type ChatChoiceEffort,
  type ChatEffortDescriptor,
  type ChatModelDescriptor,
  type ChatProvider,
  type ChatProviderDescriptor,
  type PiProviderOption,
  type ProvidersReadiness,
} from '../../../shared/types';

const LABELS: Record<ChatChoiceEffort, string> = {
  off: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};

const CLAUDE_EFFORT = ['low', 'medium', 'high', 'max'] as const;
const CODEX_EFFORT = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const;
const PI_EFFORT = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

/** Persisted marker for a new Chat that has no safe pi option to inherit. */
export const UNSELECTED_PI_MODEL_ID = '__kpm_unselected_pi_model__';

function efforts(values: readonly ChatChoiceEffort[]): ChatEffortDescriptor[] {
  return values.map((value) => ({ value, label: LABELS[value] }));
}

function providerUnavailableReason(providerLabel: string, detail: string): string {
  return `${providerLabel} is unavailable: ${detail}. Choose an available provider or finish its setup.`;
}

export function buildChatChoiceCatalog(
  readiness: ProvidersReadiness,
  piOptions: PiProviderOption[],
): ChatProviderDescriptor[] {
  const providerDescriptor = (
    provider: ChatProvider,
    label: string,
    models: ChatModelDescriptor[],
  ): ChatProviderDescriptor => {
    const status = readiness.byProvider[provider];
    const available = status.state === 'ready';
    return {
      provider,
      label,
      available,
      detail: status.detail,
      models: models.map((model) => available
        ? model
        : {
            ...model,
            available: false,
            unavailableReason: providerUnavailableReason(label, status.detail),
          }),
    };
  };

  return [
    providerDescriptor('claude', 'Claude', [
      {
        id: 'sonnet',
        label: 'Sonnet',
        available: true,
        effortLevels: efforts(CLAUDE_EFFORT),
        defaultEffort: 'medium',
      },
      {
        id: 'opus',
        label: 'Opus',
        available: true,
        // KPM's current Opus adapter deliberately omits explicit effort.
        effortLevels: [],
        defaultEffort: null,
      },
    ]),
    providerDescriptor('codex', 'Codex', CODEX_CHAT_MODELS.map((model) => ({
      id: model.value,
      label: model.label,
      available: true,
      effortLevels: efforts(CODEX_EFFORT),
      defaultEffort: 'medium',
    }))),
    providerDescriptor('pi', 'pi', piOptions.map((option) => ({
      id: `${option.provider}/${option.modelId}`,
      label: option.label,
      available: true,
      effortLevels: efforts(PI_EFFORT),
      defaultEffort: 'medium',
    }))),
  ];
}

export function findProvider(
  providers: ChatProviderDescriptor[],
  provider: ChatProvider,
): ChatProviderDescriptor {
  return providers.find((candidate) => candidate.provider === provider)!;
}

export function findModel(
  providers: ChatProviderDescriptor[],
  provider: ChatProvider,
  model: string,
): ChatModelDescriptor | undefined {
  return findProvider(providers, provider).models.find((candidate) => candidate.id === model);
}

/** Preserve a persisted unavailable model in the projection instead of replacing it. */
export function ensureSelectedModelVisible(
  providers: ChatProviderDescriptor[],
  provider: ChatProvider,
  model: string,
): ChatProviderDescriptor[] {
  if (findModel(providers, provider, model)) return providers;
  return providers.map((descriptor) => descriptor.provider !== provider
    ? descriptor
    : {
        ...descriptor,
        models: [{
          id: model,
          label: provider === 'pi' && model === UNSELECTED_PI_MODEL_ID
            ? 'No pi model selected'
            : model,
          available: false,
          unavailableReason: provider === 'pi' && model === UNSELECTED_PI_MODEL_ID
            ? 'No safe pi model is available to select automatically. Choose a pi model explicitly.'
            : `The saved ${descriptor.label} model “${model}” is no longer available. Choose another model.`,
          effortLevels: [],
          defaultEffort: null,
        }, ...descriptor.models],
      });
}
