/**
 * Scheduled Loop Validation Schemas
 *
 * Payload schemas are owned by `shared/ipc/scheduledLoopEndpoints.ts` (one
 * entry per IPC endpoint, shared with the preload bridge and the handler
 * binding). The IPC boundary uses camelCase; handlers map to the snake_case
 * repository shapes.
 */

import type { z } from 'zod';
import { scheduledLoopEndpoints } from '../../../shared/ipc/scheduledLoopEndpoints';

export const ScheduledLoopSchemas = {
  list: scheduledLoopEndpoints.list.params,
  get: scheduledLoopEndpoints.get.params,
  create: scheduledLoopEndpoints.create.params,
  update: scheduledLoopEndpoints.update.params,
  setEnabled: scheduledLoopEndpoints.setEnabled.params,
  delete: scheduledLoopEndpoints.delete.params,
  runNow: scheduledLoopEndpoints.runNow.params,
  history: scheduledLoopEndpoints.history.params,
};

export type ScheduledLoopListInput = z.infer<typeof ScheduledLoopSchemas.list>;
export type ScheduledLoopGetInput = z.infer<typeof ScheduledLoopSchemas.get>;
export type ScheduledLoopCreateInput = z.infer<typeof ScheduledLoopSchemas.create>;
export type ScheduledLoopUpdateInput = z.infer<typeof ScheduledLoopSchemas.update>;
export type ScheduledLoopSetEnabledInput = z.infer<typeof ScheduledLoopSchemas.setEnabled>;
export type ScheduledLoopDeleteInput = z.infer<typeof ScheduledLoopSchemas.delete>;
export type ScheduledLoopRunNowInput = z.infer<typeof ScheduledLoopSchemas.runNow>;
export type ScheduledLoopHistoryInput = z.infer<typeof ScheduledLoopSchemas.history>;
