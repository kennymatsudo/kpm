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
  cost?: TurnCost;
  session_id?: string;
}

export type ProviderChatMessage =
  | { type: 'assistant'; error?: string; message: { content: unknown[] } }
  | { type: 'stream_event'; parent_tool_use_id?: null; event: unknown }
  | { type: 'user'; message: { role: 'user'; content: unknown[] } }
  | ProviderTurnResult;

export function assistantText(text: string): ProviderChatMessage {
  return { type: 'assistant', message: { content: [{ type: 'text', text }] } };
}

export function assistantThinking(thinking: string): ProviderChatMessage {
  return { type: 'assistant', message: { content: [{ type: 'thinking', thinking }] } };
}

/** A turn that failed inside the provider, surfaced as the assistant's own error. */
export function assistantError(text: string, error = 'server_error'): ProviderChatMessage {
  return { type: 'assistant', error, message: { content: [{ type: 'text', text }] } };
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
  cost?: TurnCost;
  sessionId?: string;
}): ProviderTurnResult {
  return {
    type: 'result',
    usage: input.usage,
    ...(input.cost ? { cost: input.cost } : {}),
    ...(input.sessionId ? { session_id: input.sessionId } : {}),
  };
}
