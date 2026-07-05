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
import type { ToolPermission } from '../types';

const permissionAction = z.enum(['allow', 'deny', 'allow-always', 'allow-all-remaining']);

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
  list: {
    channel: 'permission:list',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse<{ permissions: ToolPermission[] }>>(),
  },
  revoke: {
    channel: 'permission:revoke',
    params: z.object({ id: uuid, projectId: uuid, cacheKey: z.string().min(1) }),
    result: resultOf<RegistryResponse>(),
  },
  revokeAll: { channel: 'permission:revoke-all', params: z.object({ projectId: uuid }), result: resultOf<RegistryResponse>() },
} satisfies Record<string, EndpointDefinition>;

export type PermissionEndpoints = typeof permissionEndpoints;
export type PermissionEndpointName = keyof PermissionEndpoints;
