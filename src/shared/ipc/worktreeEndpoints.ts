/**
 * Worktree domain endpoint registry.
 *
 * One entry per `worktree:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.worktrees`.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';


export const worktreeEndpoints = {
  getByProject: { channel: 'worktree:get-by-project', params: z.object({ projectId: uuid }) },
  getByPlanItem: { channel: 'worktree:get-by-plan-item', params: z.object({ planItemId: uuid }) },
  openEditor: { channel: 'worktree:open-editor', params: z.object({ worktreeId: uuid }) },
  getStatus: { channel: 'worktree:get-status', params: z.object({ worktreeId: uuid }) },
  delete: {
    channel: 'worktree:delete',
    params: z.object({ worktreeId: uuid, force: z.boolean().optional().default(false) }),
  },
  push: { channel: 'worktree:push', params: z.object({ worktreeId: uuid }) },
  destroy: { channel: 'worktree:destroy', params: z.object({ worktreeId: uuid }) },
} satisfies Record<string, EndpointDefinition>;

export type WorktreeEndpoints = typeof worktreeEndpoints;
export type WorktreeEndpointName = keyof WorktreeEndpoints;
