/**
 * Tool log domain event registry (main -> renderer push events).
 *
 * Covers `toollog:call`/`toollog:turn-summary`, broadcast from
 * `ToolCallLogger` for the DevTools tool-call panel. Not invoke endpoints —
 * see `toolLogEndpoints.ts` for the invoke surface. Payloads reuse
 * `ToolCallLogEntry`/`ToolCallTurnSummary` from `shared/types.ts`, the
 * pre-existing IPC payload contract for these events.
 */

import { payloadOf, type EventDefinition } from './appEvents';
import type { ToolCallLogEntry, ToolCallTurnSummary } from '../types';

export const toolLogEvents = {
  call: { channel: 'toollog:call', payload: payloadOf<ToolCallLogEntry>() },
  turnSummary: { channel: 'toollog:turn-summary', payload: payloadOf<ToolCallTurnSummary>() },
} satisfies Record<string, EventDefinition>;

export type ToolLogEvents = typeof toolLogEvents;
export type ToolLogEventName = keyof ToolLogEvents;
