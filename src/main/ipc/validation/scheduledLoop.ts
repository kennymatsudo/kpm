/**
 * Scheduled Loop Validation Schemas
 *
 * Zod schemas for scheduled-loop IPC operations. The IPC boundary uses
 * camelCase; handlers map to the snake_case repository shapes.
 */

import { z } from 'zod';
import { uuid, nonEmptyString } from './shared';

const loopOutputMode = z.enum(['notify', 'report', 'maintain']);

// 5 minutes minimum (loops run agent turns — keep cost sane); 1 week maximum.
const intervalMinutes = z
  .number()
  .int()
  .min(5, 'Interval must be at least 5 minutes')
  .max(10080, 'Interval must be at most 1 week');

export const ScheduledLoopSchemas = {
  list: z.object({ projectId: uuid }),

  get: z.object({ id: uuid }),

  create: z.object({
    projectId: uuid,
    name: nonEmptyString('Loop name').max(100, 'Loop name must be under 100 characters'),
    prompt: nonEmptyString('Loop prompt').max(50000, 'Prompt too long'),
    outputMode: loopOutputMode,
    intervalMinutes,
    enabled: z.boolean().optional(),
  }),

  update: z.object({
    id: uuid,
    name: nonEmptyString('Loop name').max(100, 'Loop name must be under 100 characters').optional(),
    prompt: nonEmptyString('Loop prompt').max(50000, 'Prompt too long').optional(),
    outputMode: loopOutputMode.optional(),
    intervalMinutes: intervalMinutes.optional(),
    enabled: z.boolean().optional(),
  }),

  setEnabled: z.object({ id: uuid, enabled: z.boolean() }),

  delete: z.object({ id: uuid }),

  runNow: z.object({ id: uuid }),

  history: z.object({
    loopId: uuid,
    limit: z.number().int().min(1).max(200).optional(),
  }),
};

export type ScheduledLoopListInput = z.infer<typeof ScheduledLoopSchemas.list>;
export type ScheduledLoopGetInput = z.infer<typeof ScheduledLoopSchemas.get>;
export type ScheduledLoopCreateInput = z.infer<typeof ScheduledLoopSchemas.create>;
export type ScheduledLoopUpdateInput = z.infer<typeof ScheduledLoopSchemas.update>;
export type ScheduledLoopSetEnabledInput = z.infer<typeof ScheduledLoopSchemas.setEnabled>;
export type ScheduledLoopDeleteInput = z.infer<typeof ScheduledLoopSchemas.delete>;
export type ScheduledLoopRunNowInput = z.infer<typeof ScheduledLoopSchemas.runNow>;
export type ScheduledLoopHistoryInput = z.infer<typeof ScheduledLoopSchemas.history>;
