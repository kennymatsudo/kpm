/**
 * Claude generation adapter.
 *
 * Builds the SDK options a one-shot text generation needs from the neutral
 * request — this is where the per-call-site `sdkOptions` assembly moved to. It
 * owns the pinned Claude invariants (bundled-binary spawn options, the
 * `CLAUDE_AGENT_SDK_CLIENT_APP` env tag, `persistSession: false`, no tools) so
 * no generation site can drift from them. `runClaudeQuery` remains the message
 * loop underneath.
 */

import type { Options as SDKOptions } from '@anthropic-ai/claude-agent-sdk';
import { runClaudeQuery, type ClaudeQueryUsage } from '../claude/runClaudeQuery';
import { getClaudeSdkSpawnOptions } from '../claude/findClaude';
import type {
  GenerationOutcome,
  GenerationProviderAdapter,
  GenerationResult,
  GenerationRunHooks,
  GenerationUsage,
  ResolvedGenerationRequest,
} from './types';

function buildClaudeSdkOptions(request: ResolvedGenerationRequest): SDKOptions {
  const options: SDKOptions = {
    model: request.model,
    // One-shot generation never touches tools.
    tools: [],
    persistSession: false,
    ...getClaudeSdkSpawnOptions(),
    env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: 'kpm' },
  };
  if (request.systemPrompt !== undefined) {
    options.systemPrompt = request.systemPrompt;
  }
  if (request.maxTurns !== undefined) {
    options.maxTurns = request.maxTurns;
  }
  return options;
}

function mapUsage(usage?: ClaudeQueryUsage): GenerationUsage | undefined {
  if (!usage) {
    return undefined;
  }
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? undefined,
  };
}

function deriveOutcome(resultSubtype: string | undefined, errors: string[]): GenerationOutcome {
  if (resultSubtype === 'success' || resultSubtype === undefined) {
    return { status: 'completed' };
  }
  if (/max.*turns/i.test(resultSubtype)) {
    return { status: 'max_turns', reasonCode: resultSubtype };
  }
  return {
    status: 'error',
    reasonCode: resultSubtype,
    detail: errors.length > 0 ? errors.join('; ') : resultSubtype,
  };
}

function emptyUsage(): GenerationUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
}

export const claudeGenerationProvider: GenerationProviderAdapter = {
  provider: 'claude',
  async run(
    request: ResolvedGenerationRequest,
    hooks?: GenerationRunHooks,
  ): Promise<GenerationResult> {
    const result = await runClaudeQuery({
      prompt: request.prompt,
      sdkOptions: buildClaudeSdkOptions(request),
      timeoutMs: request.timeoutMs,
      timeoutMessage: request.timeoutMessage,
      onText: request.onText,
      recordUsage: hooks?.onUsage
        ? (event) => hooks.onUsage?.(mapUsage(event.usage) ?? emptyUsage(), event.totalCostUsd)
        : undefined,
    });

    return {
      provider: 'claude',
      model: request.model,
      text: result.text,
      outcome: deriveOutcome(result.resultSubtype, result.errors),
      usage: mapUsage(result.usage),
      totalCostUsd: result.totalCostUsd,
      errors: [...result.errors],
    };
  },
};
