import { PI_UNRESOLVED_MODEL_ID, type PiProviderOption } from '../../../shared/types';

/** Builds the `"<provider>/<modelId>"` selector `chat:send`'s `providerModel` param expects. */
export function piProviderModelSelector(option: Pick<PiProviderOption, 'provider' | 'modelId'>): string {
  return `${option.provider}/${option.modelId}`;
}

export interface PiOptionDisplay {
  primary: string;
  secondary?: string;
}

/** Derives the visible model/provider text for a pi.dev picker option. */
export function getPiOptionDisplay(option: PiProviderOption): PiOptionDisplay {
  const modelName = option.modelName?.trim();
  const isUnresolvedPlaceholder = !modelName && option.modelId === PI_UNRESOLVED_MODEL_ID;
  const primary = modelName || (isUnresolvedPlaceholder ? option.label : option.modelId);
  let providerLabel = option.label;

  if (modelName) {
    const modelSuffix = ` — ${modelName}`;
    providerLabel = option.label.endsWith(modelSuffix)
      ? option.label.slice(0, -modelSuffix.length)
      : option.label;
  }

  return {
    primary,
    secondary: providerLabel !== primary ? providerLabel : undefined,
  };
}

/** Looks up the option a persisted/selected `"<provider>/<modelId>"` selector refers to. */
export function findPiProviderOption(
  providers: readonly PiProviderOption[],
  selector: string | undefined,
): PiProviderOption | undefined {
  if (!selector) return undefined;
  return providers.find((option) => piProviderModelSelector(option) === selector);
}

/**
 * First safe option, in list order. Never returns an unsafe one — selecting
 * an unsafe provider is only ever a deliberate user action gated by
 * {@link requiresUnsafeAcknowledgment}, not something picked automatically.
 */
export function pickDefaultPiProviderOption(providers: readonly PiProviderOption[]): PiProviderOption | undefined {
  return providers.find((option) => option.safe);
}

/**
 * True when selecting `option` needs the one-time "runs its own agent"
 * warning first — i.e. it's unsafe and this provider hasn't been
 * acknowledged yet. Safe options, and already-acknowledged unsafe ones,
 * never require it.
 */
export function requiresUnsafeAcknowledgment(
  option: Pick<PiProviderOption, 'provider' | 'safe'> | undefined,
  acknowledgedProviders: ReadonlySet<string>,
): boolean {
  return option !== undefined && !option.safe && !acknowledgedProviders.has(option.provider);
}

/** Adds `provider` to the acknowledged set, returning a new set (no-op-equivalent if already present). */
export function withAcknowledgedProvider(
  acknowledgedProviders: ReadonlySet<string>,
  provider: string,
): ReadonlySet<string> {
  if (acknowledgedProviders.has(provider)) return acknowledgedProviders;
  return new Set([...acknowledgedProviders, provider]);
}
