/**
 * Action domain event registry (main -> renderer push events).
 *
 * Covers `action:run`, broadcast from `ActionRunnerService` after each run so the
 * status and run-history UI refreshes. Not an invoke endpoint — see
 * `actionEndpoints.ts` for the invoke surface.
 */

import { payloadOf, type EventDefinition } from './appEvents';
import type { ActionRunOutcome } from '../actions';

export interface ActionRunEventData {
  actionId: string;
  /** The project the run executed against; a global action resolves one per run. */
  projectId: string;
  outcome: ActionRunOutcome;
}

export const actionEvents = {
  run: { channel: 'action:run', payload: payloadOf<ActionRunEventData>() },
} satisfies Record<string, EventDefinition>;

export type ActionEvents = typeof actionEvents;
export type ActionEventName = keyof ActionEvents;
