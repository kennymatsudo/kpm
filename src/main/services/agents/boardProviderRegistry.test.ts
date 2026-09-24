import { describe, expect, it } from 'vitest';
import { PI_UNRESOLVED_MODEL_ID } from '../../../shared/types';
import { createTestConfig, setConfig } from '../../config';
import { listBoardProviders } from './boardProviderRegistry';
import { FALLBACK_MODEL_CATALOG } from '../../../shared/modelCatalog';

describe('board provider registry', () => {
  it('reports executable board providers and configured Pi models', async () => {
    setConfig(createTestConfig({}));
    const providers = await listBoardProviders({
      isAvailable: async (provider) => provider !== 'gemini',
      listPiModels: async () => [
        { provider: 'openai', modelId: 'gpt-5.6-sol', modelName: 'GPT-5.6 Sol', label: 'OpenAI — GPT-5.6 Sol', safe: true },
        { provider: 'cursor', modelId: 'claude-sonnet-5', modelName: 'Sonnet 5', label: 'Cursor — Sonnet 5', safe: true },
      ],
    });
    expect(providers.find((provider) => provider.id === 'claude')).toMatchObject({ available: true, capabilities: { nativeSkills: true } });
    expect(providers.find((provider) => provider.id === 'codex')).toMatchObject({ available: true, capabilities: { reviewSandbox: true } });
    expect(providers.find((provider) => provider.id === 'gemini')).toMatchObject({
      available: false,
      unavailableReason: 'Gemini CLI is not available',
    });
    expect(providers.find((provider) => provider.id === 'pi')).toMatchObject({
      available: true,
      models: [
        { id: 'openai/gpt-5.6-sol', name: 'OpenAI — GPT-5.6 Sol', isDefault: true },
        { id: 'cursor/claude-sonnet-5', name: 'Cursor — Sonnet 5' },
      ],
      capabilities: { nativeSkills: false, reviewSandbox: false },
    });
  });

  it('keeps Pi unavailable when credentials do not resolve to a model', async () => {
    setConfig(createTestConfig({}));
    const providers = await listBoardProviders({
      isAvailable: async () => true,
      listPiModels: async () => [
        { provider: 'openai', modelId: PI_UNRESOLVED_MODEL_ID, label: 'OpenAI', safe: true },
      ],
    });

    expect(providers.find((provider) => provider.id === 'pi')).toMatchObject({
      available: false,
      models: [],
      unavailableReason: 'No authenticated Pi models are available',
    });
  });

  it('offers the fetched Codex list while preserving the board default', async () => {
    setConfig(createTestConfig({ agentSession: { codexModel: 'gpt-5.5' } }));
    const providers = await listBoardProviders({
      isAvailable: async () => true,
      listPiModels: async () => [],
      getModelCatalog: () => ({
        ...FALLBACK_MODEL_CATALOG,
        codex: [
          { id: 'gpt-6-astra', label: 'GPT-6-Astra', effortLevels: [] },
          { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra', effortLevels: [] },
        ],
      }),
    });

    expect(providers.find((provider) => provider.id === 'codex')?.models).toEqual([
      { id: 'gpt-5.5', name: 'gpt-5.5', isDefault: true },
      { id: 'gpt-6-astra', name: 'GPT-6-Astra' },
      { id: 'gpt-5.6-terra', name: 'GPT-5.6-Terra' },
    ]);
  });

  it('names Claude models the way Claude does', async () => {
    const providers = await listBoardProviders({
      isAvailable: async () => true,
      listPiModels: async () => [],
      getModelCatalog: () => ({
        ...FALLBACK_MODEL_CATALOG,
        claude: [
          { id: 'sonnet', label: 'Sonnet 5', effortLevels: [] },
          { id: 'opus', label: 'Opus 5.5', effortLevels: [] },
        ],
      }),
    });

    expect(providers.find((provider) => provider.id === 'claude')?.models).toEqual([
      { id: 'sonnet', name: 'Sonnet 5', isDefault: true },
      { id: 'opus', name: 'Opus 5.5' },
    ]);
  });
});
