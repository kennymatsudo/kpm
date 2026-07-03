/**
 * Permission domain endpoint registry.
 *
 * `permission:request` is a main-to-renderer event (`webContents.send` /
 * `ipcRenderer.on`), not an invoke endpoint, so it stays hand-declared in
 * `src/preload/api.ts` and out of this registry.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';

const permissionAction = z.enum(['allow', 'deny', 'allow-always', 'allow-all-remaining']);

export const permissionEndpoints = {
  respond: {
    channel: 'permission:respond',
    params: z.object({ requestId: uuid, projectId: uuid, action: permissionAction }),
  },
  list: { channel: 'permission:list', params: z.object({ projectId: uuid }) },
  revoke: {
    channel: 'permission:revoke',
    params: z.object({ id: uuid, projectId: uuid, cacheKey: z.string().min(1) }),
  },
  revokeAll: { channel: 'permission:revoke-all', params: z.object({ projectId: uuid }) },
} satisfies Record<string, EndpointDefinition>;

export type PermissionEndpoints = typeof permissionEndpoints;
export type PermissionEndpointName = keyof PermissionEndpoints;
