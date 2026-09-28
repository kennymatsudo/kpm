import { describe, expect, it } from 'vitest';
import { buildChatChoiceCatalog, findModel } from './policy';
import { buildPiProviderOptions } from '../../pi/providers';
import { FALLBACK_MODEL_CATALOG } from '../../../shared/modelCatalog';
import type { ProvidersReadiness } from '../../../shared/types';

function ready(): ProvidersReadiness {
  return {
    anyReady: true,
    byProvider: Object.fromEntries((['claude', 'codex', 'pi'] as const).map((provider) => [provider, {
      provider,
      state: 'ready',
      detail: 'Ready',
    }])) as ProvidersReadiness['byProvider'],
  };
}

function piModel(models: Parameters<typeof buildPiProviderOptions>[0]['models'], id: string) {
  const options = buildPiProviderOptions({
    defaultSelector: null,
    credentials: ['openai'],
    providerNames: { openai: 'OpenAI' },
    models,
    extensionErrors: [],
    diagnostics: [],
  });
  return findModel(buildChatChoiceCatalog(ready(), options, FALLBACK_MODEL_CATALOG), 'pi', `openai/${id}`)!;
}

describe('pi effort levels', () => {
  it('offers only the levels pi accepts for the model and starts where pi would', () => {
    const model = piModel([{
      provider: 'openai',
      id: 'gpt-5.5',
      name: 'GPT-5.5',
      thinkingLevels: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'],
      defaultThinkingLevel: 'high',
    }], 'gpt-5.5');

    expect(model.effortLevels.map((level) => level.value)).toEqual(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']);
    expect(model.defaultEffort).toBe('high');
  });

  it('offers no picker for a model without reasoning', () => {
    const model = piModel([{ provider: 'openai', id: 'gpt-4.1', name: 'GPT-4.1', thinkingLevels: ['off'] }], 'gpt-4.1');

    expect(model.effortLevels).toEqual([]);
    expect(model.defaultEffort).toBeNull();
  });

  it('falls back to every level when the catalog did not report them', () => {
    const model = piModel([{ provider: 'openai', id: 'gpt-5.5', name: 'GPT-5.5' }], 'gpt-5.5');

    expect(model.effortLevels).toHaveLength(7);
    expect(model.defaultEffort).toBe('medium');
  });
});
