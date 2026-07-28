/**
 * Permission domain event registry (main -> renderer push events).
 *
 * Covers `permission:request`, broadcast from `PermissionPromptService` when
 * a tool call needs user approval. Not an invoke endpoint — see
 * `permissionEndpoints.ts` for the invoke surface. Payload reuses
 * `PermissionRequest` from `shared/types.ts`, the pre-existing IPC payload
 * contract for this event.
 */

import { payloadOf, type EventDefinition } from './appEvents';
import type { PermissionRequest } from '../types';

export interface WriteGrantChanged {
  chatSessionId: string;
  granted: boolean;
}

export const permissionEvents = {
  request: { channel: 'permission:request', payload: payloadOf<PermissionRequest>() },
  writeGrantChanged: { channel: 'permission:write-grant-changed', payload: payloadOf<WriteGrantChanged>() },
} satisfies Record<string, EventDefinition>;

export type PermissionEvents = typeof permissionEvents;
export type PermissionEventName = keyof PermissionEvents;
