/**
 * Dev session domain event registry (main -> renderer push events).
 *
 * Covers `dev-session:status-changed`, broadcast via
 * `rendererBroadcast.ts`'s `createStatusBroadcaster` from both
 * `DevSessionService` and `automationPhaseMachine`. Not an invoke endpoint —
 * see `devSessionEndpoints.ts` for the invoke surface.
 */

import { payloadOf, type EventDefinition } from './appEvents';

export interface DevSessionStatusChangedEventData {
  sessionId: string;
  projectId: string;
  status: string;
}

export const devSessionEvents = {
  statusChanged: { channel: 'dev-session:status-changed', payload: payloadOf<DevSessionStatusChangedEventData>() },
} satisfies Record<string, EventDefinition>;

export type DevSessionEvents = typeof devSessionEvents;
export type DevSessionEventName = keyof DevSessionEvents;
