/**
 * Permission domain event registry (main -> renderer push events).
 *
 * Covers `permission:request`, broadcast from `PermissionPromptService` when
 * a tool call needs user approval. Not an invoke endpoint — see
 * `permissionEndpoints.ts` for the invoke surface. Payload reuses
 * `PermissionRequest` from `shared/types.ts`, the pre-existing IPC payload
 * contract for this event.
 *
 * `permission:settled` is the counterpart for requests that stop needing an
 * answer without the user giving one — a timeout or an aborted turn. Without
 * it the renderer's pending queue only ever shrinks when the user responds, so
 * a request that expired an hour ago would still be advertised as blocking.
 */

import { payloadOf, type EventDefinition } from './appEvents';
import type { PermissionRequest } from '../types';

export interface WriteGrantChanged {
  projectId: string;
  granted: boolean;
}

/** A pending request that no longer needs an answer, and why. */
export interface PermissionSettled {
  requestId: string;
  reason: 'timeout' | 'cancelled';
}

export const permissionEvents = {
  request: { channel: 'permission:request', payload: payloadOf<PermissionRequest>() },
  writeGrantChanged: { channel: 'permission:write-grant-changed', payload: payloadOf<WriteGrantChanged>() },
  settled: { channel: 'permission:settled', payload: payloadOf<PermissionSettled>() },
} satisfies Record<string, EventDefinition>;

export type PermissionEvents = typeof permissionEvents;
export type PermissionEventName = keyof PermissionEvents;
