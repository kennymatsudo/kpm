import { describe, expect, it } from 'vitest';

import { resolveModelContextWindow } from './usage-types';

describe('resolveModelContextWindow', () => {
  it('keeps Claude aliases and full model ids on their family defaults', () => {
    expect(resolveModelContextWindow('opus')).toBe(1_000_000);
    expect(resolveModelContextWindow('claude-sonnet-4-6')).toBe(200_000);
    expect(resolveModelContextWindow('claude-haiku-4-5')).toBe(200_000);
  });

  it('uses the selected Codex/OpenAI model instead of the Claude fallback', () => {
    expect(resolveModelContextWindow('gpt-5.5')).toBe(400_000);
    expect(resolveModelContextWindow('openai-codex/gpt-5.4-mini')).toBe(400_000);
    expect(resolveModelContextWindow('openai/gpt-4.1')).toBe(128_000);
  });

  it('uses Cursor plugin context windows before interpreting model suffixes', () => {
    expect(resolveModelContextWindow('cursor/opus-latest@1m')).toBe(300_000);
    expect(resolveModelContextWindow('cursor/opus-latest@1m:fast')).toBe(300_000);
    expect(resolveModelContextWindow('cursor/gpt-5.4-mini')).toBe(272_000);
    expect(resolveModelContextWindow('cursor/gpt-5.3-codex-spark')).toBe(128_000);
    expect(resolveModelContextWindow('cursor/auto')).toBe(200_000);
  });

  it('honors explicit context-window suffixes from non-Cursor pi provider selectors', () => {
    expect(resolveModelContextWindow('anthropic/claude-sonnet-4-6-200k')).toBe(200_000);
    expect(resolveModelContextWindow('local/model:128k')).toBe(128_000);
  });

  it('falls back to the conservative Sonnet-sized window for unknown models', () => {
    expect(resolveModelContextWindow(undefined)).toBe(200_000);
  });
});
