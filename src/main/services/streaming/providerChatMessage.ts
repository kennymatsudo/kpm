/**
 * The message shape a non-Claude chat adapter emits.
 *
 * Claude's own session forwards the Agent SDK's messages as they arrive; the
 * Codex and pi adapters have to build equivalents by hand. Both were doing that
 * against an undeclared shape — the reader casts to `any`, so nothing checked
 * that an adapter's literal and the reader's expectations agreed. Two adapters
 * is a real seam, so it gets written down: build a message with one of these,
 * never with an object literal.
 *
 * Deliberately a narrow subset of `SDKMessage`: it carries only the frames the
 * two adapters can actually produce.
 */

/** Cost as the provider reports it, which is not the same question per provider. */
export interface TurnCost {
  usd: number;
  /**
   * `cumulative` — the session's running total, so usage recording stores the
   * delta against the previous turn (Claude). `per-turn` — this turn's own
   * spend, stored as-is (pi). Getting this wrong under-records every turn
   * after the first.
   */
  basis: 'cumulative' | 'per-turn';
}

export interface ProviderTurnResult {
  type: 'result';
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
  /**
   * The turn's final model request, when it differs from the turn's billed
   * `usage`: context fullness is what the last request sent, not the turn's sum.
   */
  contextUsage?: ProviderTurnResult['usage'];
  /** Actual model capacity reported by the provider for this thread. */
  contextWindow?: number;
  /** The model that actually answered, when the provider reports it. */
  model?: string;
  cost?: TurnCost;
  /**
   * The provider reports no cost and KPM has no price table for its models, so
   * usage is recorded with an unknown cost instead of being priced as Claude.
   */
  costUnknown?: true;
  session_id?: string;
  /** The answer was cut off at the provider's output limit. */
  outputLimitReached?: boolean;
}

export type ProviderChatMessage =
  | { type: 'assistant'; message: { content: unknown[] } }
  | { type: 'stream_event'; parent_tool_use_id?: null; event: unknown }
  | { type: 'user'; message: { role: 'user'; content: unknown[] } }
  /**
   * The turn failed and will not recover. `message` is the complete banner
   * text, naming the provider, because only the adapter knows which provider
   * failed and what its error codes mean.
   */
  | { type: 'provider_error'; message: string }
  /** Something worth seeing that does not end the turn, such as a retry. */
  | { type: 'provider_notice'; label: string; detail: string }
  | ProviderTurnResult;

export function assistantText(text: string): ProviderChatMessage {
  return { type: 'assistant', message: { content: [{ type: 'text', text }] } };
}

export function assistantThinking(thinking: string): ProviderChatMessage {
  return { type: 'assistant', message: { content: [{ type: 'thinking', thinking }] } };
}

export function providerError(message: string): ProviderChatMessage {
  return { type: 'provider_error', message };
}

export function providerNotice(label: string, detail: string): ProviderChatMessage {
  return { type: 'provider_notice', label, detail };
}

/**
 * Banner text for a failed turn: what to do, then the provider's own words,
 * which are often the only place a reset time or a quota name appears.
 */
export function describeProviderFailure(guidance: string, providerMessage: string | undefined): string {
  const detail = providerMessage?.trim();
  return detail ? `${guidance} Details: ${detail}` : guidance;
}

export function toolUse(id: string, name: string, input: unknown): ProviderChatMessage {
  return { type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } };
}

export function textDelta(text: string): ProviderChatMessage {
  return {
    type: 'stream_event',
    parent_tool_use_id: null,
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
  };
}

/**
 * The marker a queued follow-up was pulled off the queue and is now being
 * answered. Carries no content: it exists so the interpreter can tell a live
 * follow-up from the turn that answers it.
 */
export function userTurnEcho(): ProviderChatMessage {
  return { type: 'user', message: { role: 'user', content: [] } };
}

export function turnResult(input: {
  usage: ProviderTurnResult['usage'];
  contextUsage?: ProviderTurnResult['usage'];
  contextWindow?: number;
  model?: string;
  cost?: TurnCost;
  costUnknown?: true;
  sessionId?: string;
  outputLimitReached?: boolean;
}): ProviderTurnResult {
  return {
    type: 'result',
    usage: input.usage,
    ...(input.contextUsage ? { contextUsage: input.contextUsage } : {}),
    ...(input.contextWindow ? { contextWindow: input.contextWindow } : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(input.cost ? { cost: input.cost } : {}),
    ...(input.costUnknown ? { costUnknown: true as const } : {}),
    ...(input.sessionId ? { session_id: input.sessionId } : {}),
    ...(input.outputLimitReached ? { outputLimitReached: true } : {}),
  };
}
