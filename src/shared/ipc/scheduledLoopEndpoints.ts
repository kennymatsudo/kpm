/**
 * Scheduled loop domain endpoint registry.
 *
 * One entry per `scheduled-loop:*` IPC endpoint, keyed by the dotted method
 * path used on `window.api.scheduledLoops`. `scheduled-loop:run` is a
 * main->renderer event, not an invoke endpoint, so it stays hand-declared in
 * `src/preload/api.ts`.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';
import type { ScheduledLoop, LoopRun } from '../types';

const nonEmptyString = (fieldName: string) => z.string().min(1, `${fieldName} cannot be empty`).trim();
const loopOutputMode = z.enum(['notify', 'report', 'maintain']);

// 5 minutes minimum (loops run agent turns — keep cost sane); 1 week maximum.
const intervalMinutes = z
  .number()
  .int()
  .min(5, 'Interval must be at least 5 minutes')
  .max(10080, 'Interval must be at most 1 week');

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/scheduledLoops.ts`): the handler returns bare data
 * (or `void`), and the registry loop wraps it as `{success: true, ...data}` /
 * `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

export const scheduledLoopEndpoints = {
  list: {
    channel: 'scheduled-loop:list',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse<{ loops: ScheduledLoop[] }>>(),
  },
  get: {
    channel: 'scheduled-loop:get',
    params: z.object({ id: uuid }),
    result: resultOf<RegistryResponse<{ loop: ScheduledLoop }>>(),
  },
  create: {
    channel: 'scheduled-loop:create',
    params: z.object({
      projectId: uuid,
      name: nonEmptyString('Loop name').max(100, 'Loop name must be under 100 characters'),
      prompt: nonEmptyString('Loop prompt').max(50000, 'Prompt too long'),
      outputMode: loopOutputMode,
      intervalMinutes,
      enabled: z.boolean().optional(),
    }),
    result: resultOf<RegistryResponse<{ loop: ScheduledLoop }>>(),
  },
  update: {
    channel: 'scheduled-loop:update',
    params: z.object({
      id: uuid,
      name: nonEmptyString('Loop name').max(100, 'Loop name must be under 100 characters').optional(),
      prompt: nonEmptyString('Loop prompt').max(50000, 'Prompt too long').optional(),
      outputMode: loopOutputMode.optional(),
      intervalMinutes: intervalMinutes.optional(),
      enabled: z.boolean().optional(),
    }),
    result: resultOf<RegistryResponse<{ loop: ScheduledLoop }>>(),
  },
  setEnabled: {
    channel: 'scheduled-loop:set-enabled',
    params: z.object({ id: uuid, enabled: z.boolean() }),
    result: resultOf<RegistryResponse<{ loop: ScheduledLoop }>>(),
  },
  delete: { channel: 'scheduled-loop:delete', params: z.object({ id: uuid }), result: resultOf<RegistryResponse>() },
  runNow: { channel: 'scheduled-loop:run-now', params: z.object({ id: uuid }), result: resultOf<RegistryResponse>() },
  history: {
    channel: 'scheduled-loop:history',
    params: z.object({ loopId: uuid, limit: z.number().int().min(1).max(200).optional() }),
    result: resultOf<RegistryResponse<{ runs: LoopRun[] }>>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type ScheduledLoopEndpoints = typeof scheduledLoopEndpoints;
export type ScheduledLoopEndpointName = keyof ScheduledLoopEndpoints;
