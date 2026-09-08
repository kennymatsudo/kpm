/**
 * Activity domain event registry (main -> renderer push events).
 *
 * Covers `activity:changed`, broadcast by `ActivityService` when the
 * cross-project work counts change. Not an invoke endpoint — see
 * `activityEndpoints.ts` for the snapshot fetch the renderer uses on mount.
 */

import { payloadOf, type EventDefinition } from './appEvents';
import type { ActivitySnapshot } from './activityEndpoints';

export const activityEvents = {
  /** Full replacement snapshot. Emitted only when the counts actually change. */
  changed: { channel: 'activity:changed', payload: payloadOf<ActivitySnapshot>() },
} satisfies Record<string, EventDefinition>;

export type ActivityEvents = typeof activityEvents;
export type ActivityEventName = keyof ActivityEvents;
