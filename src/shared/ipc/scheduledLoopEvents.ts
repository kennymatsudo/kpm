/**
 * Scheduled loop domain event registry (main -> renderer push events).
 *
 * Covers `scheduled-loop:run`, broadcast from `ScheduledLoopRunnerService`
 * after each loop tick so the loop status/history UI refreshes. Not an
 * invoke endpoint — see `scheduledLoopEndpoints.ts` for the invoke surface.
 */

import { payloadOf, type EventDefinition } from './appEvents';

export interface ScheduledLoopRunEventData {
  projectId: string;
  loopId: string;
  outcome: string;
}

export const scheduledLoopEvents = {
  run: { channel: 'scheduled-loop:run', payload: payloadOf<ScheduledLoopRunEventData>() },
} satisfies Record<string, EventDefinition>;

export type ScheduledLoopEvents = typeof scheduledLoopEvents;
export type ScheduledLoopEventName = keyof ScheduledLoopEvents;
