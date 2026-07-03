/**
 * Dev session domain endpoint registry.
 *
 * One entry per `dev-session:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.devSessions`. `dev-session:status-changed` is an event
 * (`ipcRenderer.on`), not an invoke endpoint, so it stays hand-declared in
 * `src/preload/api.ts`.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';


const devSessionStatus = z.enum(
  ['pending', 'active', 'inactive'],
  { message: 'Status must be one of: pending, active, inactive' }
);

export const devSessionEndpoints = {
  getByProject: { channel: 'dev-session:get-by-project', params: z.object({ projectId: uuid }) },
  getByProjectWithPlanItems: {
    channel: 'dev-session:get-by-project-with-plan-items',
    params: z.object({ projectId: uuid }),
  },
  getActive: { channel: 'dev-session:get-active', params: z.object({ projectId: uuid }) },
  get: { channel: 'dev-session:get', params: z.object({ sessionId: uuid }) },
  hasActive: { channel: 'dev-session:has-active', params: z.object({ planItemId: uuid }) },
  openEditor: { channel: 'dev-session:open-editor', params: z.object({ sessionId: uuid }) },
  updateStatus: {
    channel: 'dev-session:update-status',
    params: z.object({ sessionId: uuid, status: devSessionStatus }),
  },
  delete: {
    channel: 'dev-session:delete',
    params: z.object({ sessionId: uuid, cleanupWorktree: z.boolean().optional().default(true) }),
  },
  destroy: { channel: 'dev-session:destroy', params: z.object({ sessionId: uuid }) },
  checkDirty: { channel: 'dev-session:check-dirty', params: z.object({ sessionId: uuid }) },
  getDiff: { channel: 'dev-session:get-diff', params: z.object({ sessionId: uuid }) },
  getCommitsAhead: { channel: 'dev-session:get-commits-ahead', params: z.object({ sessionId: uuid }) },
  updateName: {
    channel: 'dev-session:update-name',
    params: z.object({ sessionId: uuid, name: z.string().min(1).max(200) }),
  },
  getMergeOrder: { channel: 'dev-session:get-merge-order', params: z.object({ projectId: uuid }) },
  updateMergeOrder: {
    channel: 'dev-session:update-merge-order',
    params: z.object({ sessionId: uuid, order: z.number().int().min(0).nullable() }),
  },
} satisfies Record<string, EndpointDefinition>;

export type DevSessionEndpoints = typeof devSessionEndpoints;
export type DevSessionEndpointName = keyof DevSessionEndpoints;
