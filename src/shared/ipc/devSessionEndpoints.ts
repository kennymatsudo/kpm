/**
 * Dev session domain endpoint registry.
 *
 * One entry per `dev-session:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.devSessions`. `dev-session:status-changed` is an event
 * (`ipcRenderer.on`), not an invoke endpoint, so it stays hand-declared in
 * `src/preload/api.ts`.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';
import type { DevSession, DevSessionWithPlanItem } from '../types';

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/devSessions.ts`): the handler returns bare data (or
 * `void`), and the registry loop wraps it as `{success: true, ...data}` /
 * `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

const devSessionStatus = z.enum(
  ['pending', 'active', 'inactive'],
  { message: 'Status must be one of: pending, active, inactive' }
);

export const devSessionEndpoints = {
  getByProject: {
    channel: 'dev-session:get-by-project',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse<{ sessions: DevSession[] }>>(),
  },
  getByProjectWithPlanItems: {
    channel: 'dev-session:get-by-project-with-plan-items',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse<{ sessions: DevSessionWithPlanItem[] }>>(),
  },
  getActive: {
    channel: 'dev-session:get-active',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse<{ sessions: DevSession[] }>>(),
  },
  get: {
    channel: 'dev-session:get',
    params: z.object({ sessionId: uuid }),
    result: resultOf<RegistryResponse<{ session: DevSession | undefined }>>(),
  },
  hasActive: {
    channel: 'dev-session:has-active',
    params: z.object({ planItemId: uuid }),
    result: resultOf<RegistryResponse<{ hasActive: boolean }>>(),
  },
  openEditor: {
    channel: 'dev-session:open-editor',
    params: z.object({ sessionId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  updateStatus: {
    channel: 'dev-session:update-status',
    params: z.object({ sessionId: uuid, status: devSessionStatus }),
    result: resultOf<RegistryResponse>(),
  },
  delete: {
    channel: 'dev-session:delete',
    params: z.object({ sessionId: uuid, cleanupWorktree: z.boolean().optional().default(true) }),
    result: resultOf<RegistryResponse>(),
  },
  destroy: {
    channel: 'dev-session:destroy',
    params: z.object({ sessionId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  checkDirty: {
    channel: 'dev-session:check-dirty',
    params: z.object({ sessionId: uuid }),
    result: resultOf<RegistryResponse<{ isDirty: boolean; files: string[] }>>(),
  },
  getDiff: {
    channel: 'dev-session:get-diff',
    params: z.object({ sessionId: uuid }),
    result: resultOf<RegistryResponse<{ diff: string }>>(),
  },
  getCommitsAhead: {
    channel: 'dev-session:get-commits-ahead',
    params: z.object({ sessionId: uuid }),
    result: resultOf<RegistryResponse<{ count: number }>>(),
  },
  updateName: {
    channel: 'dev-session:update-name',
    params: z.object({ sessionId: uuid, name: z.string().min(1).max(200) }),
    result: resultOf<RegistryResponse>(),
  },
  getMergeOrder: {
    channel: 'dev-session:get-merge-order',
    params: z.object({ projectId: uuid }),
    // `{ layer, blockedBy }` mirrors `MergeOrderEntry` from
    // `main/services/repo/mergeOrder.ts` — not re-imported from there to
    // avoid a shared/ -> main/ dependency.
    result: resultOf<RegistryResponse<{ mergeOrder: Record<string, { layer: number | null; blockedBy: string[] }> }>>(),
  },
  updateMergeOrder: {
    channel: 'dev-session:update-merge-order',
    params: z.object({ sessionId: uuid, order: z.number().int().min(0).nullable() }),
    result: resultOf<RegistryResponse>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type DevSessionEndpoints = typeof devSessionEndpoints;
export type DevSessionEndpointName = keyof DevSessionEndpoints;
