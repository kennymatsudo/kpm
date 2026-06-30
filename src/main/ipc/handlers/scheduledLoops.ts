/**
 * IPC Handlers for Scheduled Loops
 *
 * CRUD + run-now + history for scheduled loops. Validates with Zod and
 * delegates to ScheduledLoopService. Maps the camelCase IPC boundary to the
 * snake_case repository shapes.
 */

import { ipcMain } from 'electron';
import { createIpcHandler, ScheduledLoopSchemas } from '../validation';
import { IPC_CHANNELS } from '../channels';
import type { ScheduledLoopService } from '../../services/core/ScheduledLoopService';

export function registerScheduledLoopHandlers(scheduledLoopService: ScheduledLoopService): void {
  ipcMain.handle(
    IPC_CHANNELS.scheduledLoop.list,
    createIpcHandler(
      ScheduledLoopSchemas.list,
      async ({ projectId }) => {
        const result = scheduledLoopService.list(projectId);
        if (!result.ok) throw new Error(result.error);
        return { loops: result.data };
      },
      'Failed to list scheduled loops'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.scheduledLoop.get,
    createIpcHandler(
      ScheduledLoopSchemas.get,
      async ({ id }) => {
        const result = scheduledLoopService.get(id);
        if (!result.ok) throw new Error(result.error);
        return { loop: result.data };
      },
      'Failed to get scheduled loop'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.scheduledLoop.create,
    createIpcHandler(
      ScheduledLoopSchemas.create,
      async ({ projectId, name, prompt, outputMode, intervalMinutes, enabled }) => {
        const result = scheduledLoopService.create({
          project_id: projectId,
          name,
          prompt,
          output_mode: outputMode,
          interval_minutes: intervalMinutes,
          enabled,
        });
        if (!result.ok) throw new Error(result.error);
        return { loop: result.data };
      },
      'Failed to create scheduled loop'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.scheduledLoop.update,
    createIpcHandler(
      ScheduledLoopSchemas.update,
      async ({ id, name, prompt, outputMode, intervalMinutes, enabled }) => {
        const result = scheduledLoopService.update(id, {
          name,
          prompt,
          output_mode: outputMode,
          interval_minutes: intervalMinutes,
          enabled,
        });
        if (!result.ok) throw new Error(result.error);
        return { loop: result.data };
      },
      'Failed to update scheduled loop'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.scheduledLoop.setEnabled,
    createIpcHandler(
      ScheduledLoopSchemas.setEnabled,
      async ({ id, enabled }) => {
        const result = scheduledLoopService.setEnabled(id, enabled);
        if (!result.ok) throw new Error(result.error);
        return { loop: result.data };
      },
      'Failed to update scheduled loop'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.scheduledLoop.delete,
    createIpcHandler(
      ScheduledLoopSchemas.delete,
      async ({ id }) => {
        const result = scheduledLoopService.delete(id);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to delete scheduled loop'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.scheduledLoop.runNow,
    createIpcHandler(
      ScheduledLoopSchemas.runNow,
      async ({ id }) => {
        const result = await scheduledLoopService.runNow(id);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to run scheduled loop'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.scheduledLoop.history,
    createIpcHandler(
      ScheduledLoopSchemas.history,
      async ({ loopId, limit }) => {
        const result = scheduledLoopService.getHistory(loopId, limit);
        if (!result.ok) throw new Error(result.error);
        return { runs: result.data };
      },
      'Failed to get loop history'
    )
  );
}
