import { describe, expect, it } from 'vitest';
import { createTestConfig, setConfig } from '../../config';
import { listBoardProviders } from './boardProviderRegistry';

describe('board provider registry', () => {
  it('reports executable board capabilities without offering dead pi entries', async () => {
    setConfig(createTestConfig({}));
    const providers = await listBoardProviders({
      isAvailable: async (provider) => provider !== 'gemini',
    });
    expect(providers.find((provider) => provider.id === 'claude')).toMatchObject({ available: true, capabilities: { nativeSkills: true } });
    expect(providers.find((provider) => provider.id === 'codex')).toMatchObject({ available: true, capabilities: { reviewSandbox: true } });
    expect(providers.some((provider) => provider.id.startsWith('pi:'))).toBe(false);
  });
});
