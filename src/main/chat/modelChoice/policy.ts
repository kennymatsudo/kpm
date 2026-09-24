import type {
  ChatChoiceEffort,
  ChatEffortDescriptor,
  ChatModelDescriptor,
  ChatProvider,
  ChatProviderDescriptor,
  PiProviderOption,
  ProvidersReadiness,
} from '../../../shared/types';
import type { CatalogModel, ModelCatalog } from '../../../shared/modelCatalog';

const LABELS: Record<ChatChoiceEffort, string> = {
  off: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};

const PI_EFFORT = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

/** Persisted marker for a new Chat that has no safe pi option to inherit. */
export const UNSELECTED_PI_MODEL_ID = '__kpm_unselected_pi_model__';

function efforts(values: readonly ChatChoiceEffort[]): ChatEffortDescriptor[] {
  return values.map((value) => ({ value, label: LABELS[value] }));
}

/**
 * Used only before the provider's own list has been fetched, when KPM does
 * not know a model's real starting effort yet.
 */
const FALLBACK_DEFAULT_EFFORT: Record<'claude' | 'codex', ChatChoiceEffort> = {
  claude: 'medium',
  codex: 'high',
};

/** A model starts at the effort its provider would pick for it, so the picker shows a real level. */
function catalogDescriptors(provider: 'claude' | 'codex', models: CatalogModel[]): ChatModelDescriptor[] {
  return models.map((model) => {
    const candidates = [model.providerDefaultEffort, FALLBACK_DEFAULT_EFFORT[provider]];
    const defaultEffort = candidates.find((effort) => effort && model.effortLevels.includes(effort))
      ?? model.effortLevels[0]
      ?? null;
    return {
      id: model.id,
      label: model.label,
      available: true,
      effortLevels: efforts(model.effortLevels),
      defaultEffort,
      ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
    };
  });
}

function providerUnavailableReason(providerLabel: string, detail: string): string {
  return `${providerLabel} is unavailable: ${detail}. Choose an available provider or finish its setup.`;
}

export function buildChatChoiceCatalog(
  readiness: ProvidersReadiness,
  piOptions: PiProviderOption[],
  modelCatalog: ModelCatalog,
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
    providerDescriptor('claude', 'Claude', catalogDescriptors('claude', modelCatalog.claude)),
    providerDescriptor('codex', 'Codex', catalogDescriptors('codex', modelCatalog.codex)),
    providerDescriptor('pi', 'pi', piOptions.map((option) => ({
      id: `${option.provider}/${option.modelId}`,
      label: option.label,
      available: true,
      effortLevels: efforts(PI_EFFORT),
      defaultEffort: 'medium',
      ...(option.contextWindow ? { contextWindow: option.contextWindow } : {}),
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
