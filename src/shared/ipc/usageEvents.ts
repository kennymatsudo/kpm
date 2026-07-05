/**
 * Usage domain event registry (main -> renderer push events).
 *
 * Covers `usage:event`, broadcast from `ClaudeUsageService` every time a
 * Claude turn finishes. Not an invoke endpoint — see `usageEndpoints.ts` for
 * the invoke surface. Payload reuses `UsageLiveEvent` from
 * `shared/usage-types.ts`, the pre-existing IPC payload contract for this
 * event.
 */

import { payloadOf, type EventDefinition } from './appEvents';
import type { UsageLiveEvent } from '../usage-types';

export const usageEvents = {
  event: { channel: 'usage:event', payload: payloadOf<UsageLiveEvent>() },
} satisfies Record<string, EventDefinition>;

export type UsageEvents = typeof usageEvents;
export type UsageEventName = keyof UsageEvents;
