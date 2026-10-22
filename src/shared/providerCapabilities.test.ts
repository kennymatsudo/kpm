import { describe, expect, it } from 'vitest';
import { CHAT_PROVIDERS, type ChatProvider } from './types';
import { PROVIDER_CAPABILITIES, getProviderCapabilities } from './providerCapabilities';

describe('provider capabilities', () => {
  it('declares a capability descriptor for every chat provider', () => {
    expect(Object.keys(PROVIDER_CAPABILITIES).sort()).toEqual([...CHAT_PROVIDERS].sort());
  });

  it('keeps pi conservative for transport-guaranteed interactive features', () => {
    expect(getProviderCapabilities('pi')).toMatchObject({
      liveSlashCommands: false,
      mcpServerManagement: false,
      mcpSessionInspection: false,
      promptSuggestions: false,
    });
  });

  it('preserves Claude-only interactive controls as capabilities', () => {
    const claude = getProviderCapabilities('claude');
    expect(claude.liveSlashCommands).toBe(true);
    expect(claude.mcpServerManagement).toBe(true);
    expect(claude.promptSuggestions).toBe(true);
  });

  it('is closed over the ChatProvider union at compile time', () => {
    const providers = CHAT_PROVIDERS satisfies readonly ChatProvider[];
    for (const provider of providers) {
      expect(getProviderCapabilities(provider)).toBe(PROVIDER_CAPABILITIES[provider]);
    }
  });
});
