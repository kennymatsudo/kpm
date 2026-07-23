import { getConfig } from '../../config';
import type { BoardProvider, ModelDescriptor } from '../../../shared/playbooks';
import { CODEX_CHAT_MODELS, PI_UNRESOLVED_MODEL_ID, type PiProviderOption } from '../../../shared/types';
import { listPiProviders } from '../../pi/providers';
import { isAgentAvailable } from './agentCatalog';

export interface BoardProviderRegistryDeps {
  isAvailable?: (provider: 'claude' | 'codex' | 'gemini') => Promise<boolean>;
  listPiModels?: () => Promise<PiProviderOption[]>;
}

function codexBoardModels(): ModelDescriptor[] {
  const configuredModel = getConfig().agentSession.codexModel ?? CODEX_CHAT_MODELS[0].value;
  const knownModels: ModelDescriptor[] = CODEX_CHAT_MODELS.map((model) => ({
    id: model.value,
    name: model.label,
    ...(model.value === configuredModel ? { isDefault: true } : {}),
  }));
  if (knownModels.some((model) => model.id === configuredModel)) return knownModels;
  return [{ id: configuredModel, name: configuredModel, isDefault: true }, ...knownModels];
}

function piBoardModels(options: PiProviderOption[]): ModelDescriptor[] {
  const bySelector = new Map<string, ModelDescriptor>();
  for (const option of options) {
    if (option.modelId === PI_UNRESOLVED_MODEL_ID) continue;
    const id = `${option.provider}/${option.modelId}`;
    if (!bySelector.has(id)) bySelector.set(id, { id, name: option.label });
  }
  const models = [...bySelector.values()];
  if (models[0]) models[0] = { ...models[0], isDefault: true };
  return models;
}

export async function listBoardProviders(deps: BoardProviderRegistryDeps = {}): Promise<BoardProvider[]> {
  const available = deps.isAvailable ?? isAgentAvailable;
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
      models: [
        { id: 'sonnet', name: 'Sonnet', isDefault: true },
        { id: 'opus', name: 'Opus' },
      ],
      capabilities: { nativeSkills: true, reviewSandbox: false },
      ...(!claude ? { unavailableReason: 'Claude Code is not available' } : {}),
    },
    {
      id: 'codex', name: 'Codex', available: codex,
      models: codexBoardModels(),
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
