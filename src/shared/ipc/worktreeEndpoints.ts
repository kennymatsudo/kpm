/**
 * Worktree domain endpoint registry.
 *
 * One entry per `worktree:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.worktrees`.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';
import type { Worktree, WorktreeStatus } from '../types';

/** `{success: true; data: T} | {success: false; error: string}` shape returned by `toIpcResponse`. */
type IpcResponse<T = void> = { success: true; data: T } | { success: false; error: string };

export const worktreeEndpoints = {
  getByProject: {
    channel: 'worktree:get-by-project',
    params: z.object({ projectId: uuid }),
    result: resultOf<Worktree[]>(),
  },
  getByPlanItem: {
    channel: 'worktree:get-by-plan-item',
    params: z.object({ planItemId: uuid }),
    result: resultOf<Worktree | undefined>(),
  },
  openEditor: {
    channel: 'worktree:open-editor',
    params: z.object({ worktreeId: uuid }),
    result: resultOf<IpcResponse>(),
  },
  getStatus: { channel: 'worktree:get-status', params: z.object({ worktreeId: uuid }), result: resultOf<WorktreeStatus>() },
  delete: {
    channel: 'worktree:delete',
    params: z.object({ worktreeId: uuid, force: z.boolean().optional().default(false) }),
    result: resultOf<IpcResponse>(),
  },
  push: { channel: 'worktree:push', params: z.object({ worktreeId: uuid }), result: resultOf<IpcResponse>() },
  destroy: { channel: 'worktree:destroy', params: z.object({ worktreeId: uuid }), result: resultOf<IpcResponse>() },
} satisfies Record<string, EndpointDefinition>;

export type WorktreeEndpoints = typeof worktreeEndpoints;
export type WorktreeEndpointName = keyof WorktreeEndpoints;
