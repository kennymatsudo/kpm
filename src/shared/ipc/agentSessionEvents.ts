/**
 * Agent session domain event registry (main -> renderer push events).
 *
 * Covers the `agent-session:*` broadcasts emitted from
 * `AgentSessionManager`'s internal `broadcast` helper. Not invoke endpoints —
 * see `agentSessionEndpoints.ts` for the invoke surface. Payload shapes reuse
 * the `AgentSession*Payload` interfaces already declared in
 * `shared/agent-types.ts` (the pre-existing IPC payload contract for this
 * domain) rather than re-declaring them.
 */

import { payloadOf, type EventDefinition } from './appEvents';
import type {
  AgentSessionStatePayload,
  AgentSessionActivityPayload,
  AgentSessionQuestionPayload,
  AgentSessionCompletePayload,
} from '../agent-types';

export interface AgentSessionErrorEventData {
  sessionId: string;
  devSessionId: string;
  error: string;
}

export const agentSessionEvents = {
  stateChanged: { channel: 'agent-session:state-changed', payload: payloadOf<AgentSessionStatePayload>() },
  activity: { channel: 'agent-session:activity', payload: payloadOf<AgentSessionActivityPayload>() },
  question: { channel: 'agent-session:question', payload: payloadOf<AgentSessionQuestionPayload>() },
  complete: { channel: 'agent-session:complete', payload: payloadOf<AgentSessionCompletePayload>() },
  error: { channel: 'agent-session:error', payload: payloadOf<AgentSessionErrorEventData>() },
} satisfies Record<string, EventDefinition>;

export type AgentSessionEvents = typeof agentSessionEvents;
export type AgentSessionEventName = keyof AgentSessionEvents;
