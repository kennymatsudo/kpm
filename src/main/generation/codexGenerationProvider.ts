/**
 * Codex generation adapter.
 *
 * Runs a one-shot text generation through `@openai/codex-sdk`: start a thread,
 * run a single turn, return the final text + usage. Codex has no system-prompt
 * field, so the system prompt is prepended to the user prompt (mirroring the
 * Codex chat/board sessions). No tools, no structured output — this seam is
 * plain prompt→text.
 */

import * as os from 'os';
import { Codex, type ThreadOptions, type Usage } from '@openai/codex-sdk';
import { findCodexBinaryPath } from '../codex/binary';
import type {
  GenerationOutcome,
  GenerationProviderAdapter,
  GenerationResult,
  GenerationRunHooks,
  GenerationUsage,
  ResolvedGenerationRequest,
} from './types';

function buildThreadOptions(model: string): ThreadOptions {
  return {
    model,
    // Generation reads and writes nothing on disk and needs no network for
    // tools; keep the sandbox locked down.
    sandboxMode: 'read-only',
    approvalPolicy: 'never',
    networkAccessEnabled: false,
    webSearchMode: 'disabled',
    workingDirectory: os.tmpdir(),
    skipGitRepoCheck: true,
  };
}

function composePrompt(request: ResolvedGenerationRequest): string {
  return request.systemPrompt ? `${request.systemPrompt}\n\n${request.prompt}` : request.prompt;
}

function mapUsage(usage: Usage | null): GenerationUsage | undefined {
  if (!usage) {
    return undefined;
  }
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cached_input_tokens,
    cacheWriteTokens: 0,
  };
}

function errorOutcome(detail: string): GenerationOutcome {
  return { status: 'error', detail };
}

export const codexGenerationProvider: GenerationProviderAdapter = {
  provider: 'codex',
  async run(
    request: ResolvedGenerationRequest,
    hooks?: GenerationRunHooks,
  ): Promise<GenerationResult> {
    const codex = new Codex({ codexPathOverride: findCodexBinaryPath() });
    const thread = codex.startThread(buildThreadOptions(request.model));

    const abortController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutMs = request.timeoutMs && request.timeoutMs > 0 ? request.timeoutMs : 0;
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
    }

    try {
      const turn = await thread.run(composePrompt(request), { signal: abortController.signal });

      const text = turn.finalResponse ?? '';
      if (text && request.onText) {
        request.onText(text);
      }

      const usage = mapUsage(turn.usage);
      if (usage && hooks?.onUsage) {
        hooks.onUsage(usage, null);
      }

      return {
        provider: 'codex',
        model: request.model,
        text,
        outcome: { status: 'completed' },
        usage,
        errors: [],
      };
    } catch (error) {
      if (abortController.signal.aborted) {
        throw new Error(request.timeoutMessage ?? `Codex generation timed out after ${timeoutMs}ms`, {
          cause: error,
        });
      }
      const detail = error instanceof Error ? error.message : String(error);
      return {
        provider: 'codex',
        model: request.model,
        text: '',
        outcome: errorOutcome(detail),
        errors: [detail],
      };
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  },
};
