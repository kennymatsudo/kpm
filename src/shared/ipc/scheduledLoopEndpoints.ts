/**
 * Scheduled loop domain endpoint registry.
 *
 * One entry per `scheduled-loop:*` IPC endpoint, keyed by the dotted method
 * path used on `window.api.scheduledLoops`. `scheduled-loop:run` is a
 * main->renderer event, not an invoke endpoint, so it stays hand-declared in
 * `src/preload/api.ts`.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';

const nonEmptyString = (fieldName: string) => z.string().min(1, `${fieldName} cannot be empty`).trim();
const loopOutputMode = z.enum(['notify', 'report', 'maintain']);

// 5 minutes minimum (loops run agent turns — keep cost sane); 1 week maximum.
const intervalMinutes = z
  .number()
  .int()
  .min(5, 'Interval must be at least 5 minutes')
  .max(10080, 'Interval must be at most 1 week');

export const scheduledLoopEndpoints = {
  list: { channel: 'scheduled-loop:list', params: z.object({ projectId: uuid }) },
  get: { channel: 'scheduled-loop:get', params: z.object({ id: uuid }) },
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
  },
  setEnabled: { channel: 'scheduled-loop:set-enabled', params: z.object({ id: uuid, enabled: z.boolean() }) },
  delete: { channel: 'scheduled-loop:delete', params: z.object({ id: uuid }) },
  runNow: { channel: 'scheduled-loop:run-now', params: z.object({ id: uuid }) },
  history: {
    channel: 'scheduled-loop:history',
    params: z.object({ loopId: uuid, limit: z.number().int().min(1).max(200).optional() }),
  },
} satisfies Record<string, EndpointDefinition>;

export type ScheduledLoopEndpoints = typeof scheduledLoopEndpoints;
export type ScheduledLoopEndpointName = keyof ScheduledLoopEndpoints;
