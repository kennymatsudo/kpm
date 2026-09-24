import { getConfig } from '../../config';
import type { BoardProvider, ModelDescriptor } from '../../../shared/playbooks';
import type { ModelCatalog } from '../../../shared/modelCatalog';
import { PI_UNRESOLVED_MODEL_ID, type PiProviderOption } from '../../../shared/types';
import { getModelCatalog } from '../../providers/modelCatalog';
import { listPiProviders } from '../../pi/providers';
import { isAgentAvailable } from './agentCatalog';

export interface BoardProviderRegistryDeps {
  isAvailable?: (provider: 'claude' | 'codex' | 'gemini') => Promise<boolean>;
  listPiModels?: () => Promise<PiProviderOption[]>;
  getModelCatalog?: () => ModelCatalog;
}

function codexBoardModels(catalog: ModelCatalog): ModelDescriptor[] {
  const configuredModel = getConfig().agentSession.codexModel ?? catalog.codex[0]?.id;
  const knownModels: ModelDescriptor[] = catalog.codex.map((model) => ({
    id: model.id,
    name: model.label,
    ...(model.id === configuredModel ? { isDefault: true } : {}),
  }));
  if (!configuredModel) return knownModels;
  if (knownModels.some((model) => model.id === configuredModel)) return knownModels;
  return [{ id: configuredModel, name: configuredModel, isDefault: true }, ...knownModels];
}

function piBoardModels(options: PiProviderOption[]): ModelDescriptor[] {
  const bySelector = new Map<string, ModelDescriptor>();
  let defaultSelector: string | undefined;
  for (const option of options) {
    if (option.modelId === PI_UNRESOLVED_MODEL_ID) continue;
    const id = `${option.provider}/${option.modelId}`;
    if (option.isDefault) defaultSelector = id;
    if (!bySelector.has(id)) bySelector.set(id, { id, name: option.label });
  }
  const models = [...bySelector.values()];
  // Default to the model the user's own pi CLI uses; first-listed only stands
  // in when pi has no default of its own.
  const defaultIndex = Math.max(0, models.findIndex((model) => model.id === defaultSelector));
  if (models[defaultIndex]) models[defaultIndex] = { ...models[defaultIndex], isDefault: true };
  return models;
}

export async function listBoardProviders(deps: BoardProviderRegistryDeps = {}): Promise<BoardProvider[]> {
  const available = deps.isAvailable ?? isAgentAvailable;
  const catalog = (deps.getModelCatalog ?? getModelCatalog)();
  const [claude, codex, gemini, piResult] = await Promise.all([
    available('claude'),
    available('codex'),
    available('gemini'),
    (deps.listPiModels ?? listPiProviders)()
      .then((models) => ({ models: piBoardModels(models), error: null as string | null }))
      .catch((error: unknown) => ({
        models: [] as ModelDescriptor[],
        error: error instanceof Error ? error.message : String(error),
      })),
  ]);

  const providers: BoardProvider[] = [
    {
      id: 'claude', name: 'Claude', available: claude,
      models: catalog.claude.map((model) => ({
        id: model.id,
        name: model.label,
        ...(model.id === 'sonnet' ? { isDefault: true } : {}),
      })),
      capabilities: { nativeSkills: true, reviewSandbox: false },
      ...(!claude ? { unavailableReason: 'Claude Code is not available' } : {}),
    },
    {
      id: 'codex', name: 'Codex', available: codex,
      models: codexBoardModels(catalog),
      capabilities: { nativeSkills: false, reviewSandbox: true },
      ...(!codex ? { unavailableReason: 'Codex is not authenticated' } : {}),
    },
    {
      id: 'gemini', name: 'Gemini', available: gemini,
      models: [{ id: 'default', name: 'Default', isDefault: true }],
      capabilities: { nativeSkills: false, reviewSandbox: false },
      ...(!gemini ? { unavailableReason: 'Gemini CLI is not available' } : {}),
    },
    {
      id: 'pi', name: 'Pi', available: piResult.models.length > 0,
      models: piResult.models,
      capabilities: { nativeSkills: false, reviewSandbox: false },
      ...(piResult.models.length === 0
        ? { unavailableReason: piResult.error ?? 'No authenticated Pi models are available' }
        : {}),
    },
  ];

  return providers;
}
