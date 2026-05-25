/**
 * runClaudeQuery — single-shot Claude SDK helper.
 *
 * Wraps the Claude Agent SDK's `query()` for the common case of "send a
 * prompt, get text (or structured JSON) back, capture usage." Used by every
 * one-off generation site in KPM (briefing stages, PR description, commit
 * message, review assessment, custom prompt generation, onboarding, Slack
 * triage).
 *
 * Long-lived streaming sessions (main chat via `StreamingSession`, board
 * agents via `ClaudeSdkSession`) do NOT use this — they own their own
 * message loops and emit usage via different paths.
 *
 * Usage tracking: when `recordUsage` is supplied, this helper extracts the
 * SDK's `result.usage` block and `result.total_cost_usd` and forwards them.
 * The caller decides how to attribute the call (project + source).
 */

import { query, type Options as SDKOptions } from '@anthropic-ai/claude-agent-sdk';

// =============================================================================
// Types
// =============================================================================

export interface ClaudeQueryUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export interface RunClaudeQueryOptions {
  /** Prompt sent as the user turn. */
  prompt: string;
  /** SDK options passed straight through to `query()`. */
  sdkOptions: SDKOptions;
  /**
   * Hard timeout in ms. The helper races the message loop against this
   * timeout and rejects if the SDK doesn't terminate in time. Optional —
   * pass `0` or omit to wait indefinitely (the SDK's own maxTurns guard
   * is usually enough).
   */
  timeoutMs?: number;
  /** Custom message used when the timeout fires. */
  timeoutMessage?: string;
  /**
   * Called every time the SDK emits a `result` message with billable usage.
   * Receives the raw usage block plus the SDK-reported `total_cost_usd`
   * when available. Multi-turn calls (e.g. ReviewAssessmentService) emit
   * one event per turn; the caller chooses whether to record each or sum.
   */
  recordUsage?: (event: {
    usage: ClaudeQueryUsage;
    totalCostUsd?: number | null;
  }) => void;
  /** Forwarded `thinking` content blocks (used by OnboardingService's UI). */
  onThinking?: (text: string) => void;
  /** Forwarded `tool_use` blocks (used by CustomPromptGenerationService progress). */
  onToolUse?: (toolName: string) => void;
  /**
   * Called per assistant text block as it arrives, so callers can stream
   * partial output to UI. Receives the delta only (not the running total) —
   * the caller assembles. Result-message text blocks also fire this.
   */
  onText?: (delta: string) => void;
  /**
   * Optional override for the SDK's `query()` function — used by tests to
   * inject a fake message stream. Defaults to the real SDK `query`.
   */
  queryFn?: typeof query;
}

export interface RunClaudeQueryResult<TStructured = unknown> {
  /** Concatenated text from every `assistant` text block (and any text in the result message). */
  text: string;
  /** Last seen `result.usage`, or undefined if the stream ended without one. */
  usage?: ClaudeQueryUsage;
  /** Last seen `result.total_cost_usd`, or undefined if not provided. */
  totalCostUsd?: number;
  /**
   * For runs that set `outputFormat: { type: 'json_schema', ... }`:
   * - subtype === 'success' → the validated JSON object
   * - any other subtype → undefined (errors surfaced in `errors`)
   */
  structuredOutput?: TStructured;
  /** Result subtype reported by the SDK ('success' or an error code). */
  resultSubtype?: string;
  /** HTTP status code from the API when an error occurred (SDK v0.3.144+). Useful for diagnosing rate limits vs auth failures. */
  apiErrorStatus?: number;
  /** Errors array for non-success structured-output results. */
  errors: string[];
}

// =============================================================================
// Internal: minimal type guards (the SDK types use generic `unknown`-leaning
// shapes, so this module pins down only the fields we touch).
// =============================================================================

interface ResultMessageLike {
  type: 'result';
  subtype?: string;
  usage?: ClaudeQueryUsage;
  total_cost_usd?: number | null;
  /** HTTP status code from the API when an error occurred during a successful result (SDK v0.3.144+). */
  api_error_status?: number | null;
  errors?: string[];
  structured_output?: unknown;
  message?: { content?: { type: string; text?: string }[] };
}

interface AssistantMessageLike {
  type: 'assistant';
  message?: {
    content?: {
      type: string;
      text?: string;
      thinking?: string;
      name?: string;
    }[];
  };
}

function isResultMessage(msg: unknown): msg is ResultMessageLike {
  return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'result';
}

function isAssistantMessage(msg: unknown): msg is AssistantMessageLike {
  return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'assistant';
}

// =============================================================================
// Helper
// =============================================================================

export async function runClaudeQuery<TStructured = unknown>(
  options: RunClaudeQueryOptions,
): Promise<RunClaudeQueryResult<TStructured>> {
  const queryFn = options.queryFn ?? query;
  const abortController = options.sdkOptions.abortController ?? new AbortController();
  const queryGenerator = queryFn({
    prompt: options.prompt,
    options: {
      ...options.sdkOptions,
      abortController,
    },
  });

  const acc: RunClaudeQueryResult<TStructured> = {
    text: '',
    errors: [],
  };

  const consume = async (): Promise<RunClaudeQueryResult<TStructured>> => {
    for await (const msg of queryGenerator) {
      if (isAssistantMessage(msg)) {
        const content = msg.message?.content ?? [];
        for (const block of content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            acc.text += block.text;
            options.onText?.(block.text);
          } else if (block.type === 'thinking' && typeof block.thinking === 'string' && options.onThinking) {
            options.onThinking(block.thinking);
          } else if (block.type === 'tool_use' && typeof block.name === 'string' && options.onToolUse) {
            options.onToolUse(block.name);
          }
        }
        continue;
      }

      if (isResultMessage(msg)) {
        acc.resultSubtype = msg.subtype;

        // Some flows (OnboardingService) put final text on the result message
        // instead of (or in addition to) the assistant stream. Pull any text
        // blocks out so the helper's contract — "all text ends up in .text" — holds.
        const resultContent = msg.message?.content;
        if (resultContent) {
          for (const block of resultContent) {
            if (block.type === 'text' && typeof block.text === 'string') {
              acc.text += block.text;
              options.onText?.(block.text);
            }
          }
        }

        if (msg.subtype === 'success' && 'structured_output' in msg) {
          acc.structuredOutput = msg.structured_output as TStructured;
        }
        if (msg.errors && msg.errors.length > 0) {
          acc.errors.push(...msg.errors);
        }

        if (msg.usage) {
          acc.usage = msg.usage;
        }
        if (typeof msg.total_cost_usd === 'number') {
          acc.totalCostUsd = msg.total_cost_usd;
        }
        if (typeof msg.api_error_status === 'number') {
          acc.apiErrorStatus = msg.api_error_status;
        }

        if (options.recordUsage && msg.usage) {
          options.recordUsage({
            usage: msg.usage,
            totalCostUsd: msg.total_cost_usd ?? null,
          });
        }
      }
    }

    return acc;
  };

  if (!options.timeoutMs || options.timeoutMs <= 0) {
    return consume();
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<RunClaudeQueryResult<TStructured>>((_, reject) => {
    timeoutId = setTimeout(() => {
      abortController.abort();
      reject(new Error(options.timeoutMessage ?? `Claude query timed out after ${options.timeoutMs}ms`));
    }, options.timeoutMs);
  });

  try {
    return await Promise.race([consume(), timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
