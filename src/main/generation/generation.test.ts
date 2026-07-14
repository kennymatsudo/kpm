import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Claude adapter leaf: the SDK message loop.
const runClaudeQueryMock = vi.hoisted(() => vi.fn());
vi.mock('../claude/runClaudeQuery', () => ({ runClaudeQuery: runClaudeQueryMock }));
vi.mock('../claude/findClaude', () => ({ getClaudeSdkSpawnOptions: () => ({}) }));

// Codex adapter leaf: a single thread turn.
const codexRunMock = vi.hoisted(() => vi.fn());
vi.mock('@openai/codex-sdk', () => ({
  Codex: class {
    startThread() {
      return { run: codexRunMock };
    }
  },
}));
vi.mock('../codex/binary', () => ({ findCodexBinaryPath: () => 'codex' }));

import { setConfig, createTestConfig } from '../config';
import { resolveGenerationRoute } from './routing';
import { runGeneration } from './runGeneration';
import { configureGeneration } from './runtime';
import type { GenerationPurpose, GenerationProvider } from './types';

function claudeResult(overrides: Record<string, unknown> = {}) {
  return {
    text: 'result',
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 2,
      cache_creation_input_tokens: 1,
    },
    totalCostUsd: 0.01,
    resultSubtype: 'success',
    errors: [],
    ...overrides,
  };
}

function codexTurn(overrides: Record<string, unknown> = {}) {
  return {
    finalResponse: 'result',
    usage: {
      input_tokens: 10,
      cached_input_tokens: 2,
      output_tokens: 5,
      reasoning_output_tokens: 0,
    },
    ...overrides,
  };
}

function configFor(providerByPurpose: Partial<Record<GenerationPurpose, GenerationProvider>> = {}) {
  setConfig(createTestConfig({ generation: { providerByPurpose } }));
}

describe('resolveGenerationRoute', () => {
  beforeEach(() => configFor());

  it('defaults every purpose to Claude with the tier model', () => {
    expect(resolveGenerationRoute('pr_description', 'fast')).toEqual({ provider: 'claude', model: 'sonnet' });
    expect(resolveGenerationRoute('file_summary', 'cheap')).toEqual({ provider: 'claude', model: 'haiku' });
  });

  it('honors a per-purpose Codex override', () => {
    configFor({ pr_description: 'codex' });
    expect(resolveGenerationRoute('pr_description', 'fast')).toEqual({ provider: 'codex', model: 'gpt-5.5' });
    // Untouched purposes still route to Claude.
    expect(resolveGenerationRoute('commit_message', 'cheap').provider).toBe('claude');
  });
});

describe('runGeneration', () => {
  beforeEach(() => {
    configFor();
    runClaudeQueryMock.mockReset();
    codexRunMock.mockReset();
    runClaudeQueryMock.mockResolvedValue(claudeResult());
    codexRunMock.mockResolvedValue(codexTurn());
    configureGeneration({ recordUsage: undefined });
  });

  afterEach(() => setConfig(createTestConfig({})));

  it('routes to the Claude adapter by default', async () => {
    const result = await runGeneration({ purpose: 'pr_description', tier: 'fast', prompt: 'hi' });
    expect(runClaudeQueryMock).toHaveBeenCalledTimes(1);
    expect(codexRunMock).not.toHaveBeenCalled();
    expect(result.provider).toBe('claude');
    expect(result.model).toBe('sonnet');
    expect(result.text).toBe('result');
  });

  it('routes to Codex when the purpose is overridden', async () => {
    configFor({ pr_description: 'codex' });
    const result = await runGeneration({ purpose: 'pr_description', tier: 'fast', prompt: 'hi' });
    expect(codexRunMock).toHaveBeenCalledTimes(1);
    expect(runClaudeQueryMock).not.toHaveBeenCalled();
    expect(result.provider).toBe('codex');
    expect(result.model).toBe('gpt-5.5');
  });

  it('prepends the system prompt for Codex (which has no system-prompt field)', async () => {
    configFor({ pr_description: 'codex' });
    await runGeneration({ purpose: 'pr_description', tier: 'fast', prompt: 'body', systemPrompt: 'SYS' });
    expect(codexRunMock).toHaveBeenCalledWith('SYS\n\nbody', expect.anything());
  });

  it('records usage keyed by purpose + provider', async () => {
    // The real message loop fires recordUsage per billable turn; the mock
    // must emit it so the seam's onUsage hook runs.
    runClaudeQueryMock.mockImplementationOnce(
      async (opts: { recordUsage?: (e: { usage: unknown; totalCostUsd?: number | null }) => void }) => {
        opts.recordUsage?.({
          usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2, cache_creation_input_tokens: 1 },
          totalCostUsd: 0.01,
        });
        return claudeResult();
      },
    );
    const recordUsage = vi.fn();
    configureGeneration({ recordUsage });
    await runGeneration({ purpose: 'briefing', tier: 'deep', prompt: 'hi', projectId: 'p-1' });
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'briefing',
        provider: 'claude',
        projectId: 'p-1',
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 1 },
      }),
    );
    configureGeneration({ recordUsage: undefined });
  });
});

describe('provider parity', () => {
  beforeEach(() => {
    runClaudeQueryMock.mockReset();
    codexRunMock.mockReset();
    runClaudeQueryMock.mockResolvedValue(claudeResult());
    codexRunMock.mockResolvedValue(codexTurn());
    configureGeneration({ recordUsage: undefined });
  });

  afterEach(() => setConfig(createTestConfig({})));

  it('Claude and Codex produce a structurally equivalent neutral result for the same scenario', async () => {
    configFor();
    const claude = await runGeneration({ purpose: 'pr_description', tier: 'fast', prompt: 'hi' });

    configFor({ pr_description: 'codex' });
    const codex = await runGeneration({ purpose: 'pr_description', tier: 'fast', prompt: 'hi' });

    // Same text and terminal outcome; token core matches modulo cache-write
    // (Claude reports it, Codex reports 0).
    expect(claude.text).toBe(codex.text);
    expect(claude.outcome).toEqual({ status: 'completed' });
    expect(codex.outcome).toEqual({ status: 'completed' });
    expect(claude.usage?.inputTokens).toBe(codex.usage?.inputTokens);
    expect(claude.usage?.outputTokens).toBe(codex.usage?.outputTokens);
    expect(claude.usage?.cacheReadTokens).toBe(codex.usage?.cacheReadTokens);
    expect(claude.errors).toEqual([]);
    expect(codex.errors).toEqual([]);
  });
});
