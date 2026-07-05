/**
 * Plan domain event registry (main -> renderer push events).
 *
 * Covers `plan:refresh-requested`, broadcast from `appServices.ts`'s
 * `requestPlanRefresh` helper when a background process (tracker sync,
 * review poll completion, etc.) mutates plan items outside the normal
 * IPC-response path. Not an invoke endpoint — see `planEndpoints.ts` for the
 * invoke surface.
 */

import { payloadOf, type EventDefinition } from './appEvents';

export interface PlanRefreshRequestedEventData {
  projectId: string;
}

export const planEvents = {
  refreshRequested: { channel: 'plan:refresh-requested', payload: payloadOf<PlanRefreshRequestedEventData>() },
} satisfies Record<string, EventDefinition>;

export type PlanEvents = typeof planEvents;
export type PlanEventName = keyof PlanEvents;
