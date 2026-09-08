/**
 * Permission domain endpoint registry.
 *
 * `permission:request` is a main-to-renderer event (`webContents.send` /
 * `ipcRenderer.on`), not an invoke endpoint, so it stays hand-declared in
 * `src/preload/api.ts` and out of this registry.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';

const permissionAction = z.enum(['allow', 'deny']);

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/permission.ts`): the handler returns bare data (or
 * `void`), and the registry loop wraps it as `{success: true, ...data}` /
 * `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

export const permissionEndpoints = {
  respond: {
    channel: 'permission:respond',
    params: z.object({ requestId: uuid, projectId: uuid, action: permissionAction }),
    result: resultOf<RegistryResponse>(),
  },
  getWriteGrant: {
    channel: 'permission:write-grant:get',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse<{ granted: boolean }>>(),
  },
  /**
   * The user turning writes on in settings, rather than in answer to a blocked
   * write. Without it, consent can only be given once an agent has already
   * tried and been refused — and an agent that declines preemptively (Codex
   * reports read-only instead of attempting) leaves no way to say yes.
   */
  grantWriteGrant: {
    channel: 'permission:write-grant:grant',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  revokeWriteGrant: {
    channel: 'permission:write-grant:revoke',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type PermissionEndpoints = typeof permissionEndpoints;
export type PermissionEndpointName = keyof PermissionEndpoints;
