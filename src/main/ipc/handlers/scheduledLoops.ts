/**
 * IPC Handlers for Scheduled Loops
 *
 * CRUD + run-now + history for scheduled loops. Validates with Zod and
 * delegates to ScheduledLoopService. Maps the camelCase IPC boundary to the
 * snake_case repository shapes.
 */

import { scheduledLoopEndpoints, type ScheduledLoopEndpointName } from '../../../shared/ipc/scheduledLoopEndpoints';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';
import type { ScheduledLoopService } from '../../services/core/ScheduledLoopService';
import { createRegistryIpcHandlers } from '../validation/utils';

/**
 * One handler per `scheduledLoopEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type ScheduledLoopHandlers = {
  [K in ScheduledLoopEndpointName]: UnwrappedHandlerFor<typeof scheduledLoopEndpoints, K>;
};

function buildScheduledLoopHandlers(scheduledLoopService: ScheduledLoopService): ScheduledLoopHandlers {
  return {
    list: async ({ projectId }) => {
      const result = scheduledLoopService.list(projectId);
      if (!result.ok) throw new Error(result.error);
      return { loops: result.data };
    },

    get: async ({ id }) => {
      const result = scheduledLoopService.get(id);
      if (!result.ok) throw new Error(result.error);
      return { loop: result.data };
    },

    create: async ({ projectId, name, prompt, outputMode, intervalMinutes, enabled }) => {
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

    update: async ({ id, name, prompt, outputMode, intervalMinutes, enabled }) => {
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

    setEnabled: async ({ id, enabled }) => {
      const result = scheduledLoopService.setEnabled(id, enabled);
      if (!result.ok) throw new Error(result.error);
      return { loop: result.data };
    },

    delete: async ({ id }) => {
      const result = scheduledLoopService.delete(id);
      if (!result.ok) throw new Error(result.error);
    },

    runNow: async ({ id }) => {
      const result = await scheduledLoopService.runNow(id);
      if (!result.ok) throw new Error(result.error);
    },

    history: async ({ loopId, limit }) => {
      const result = scheduledLoopService.getHistory(loopId, limit);
      if (!result.ok) throw new Error(result.error);
      return { runs: result.data };
    },
  };
}

export function registerScheduledLoopHandlers(scheduledLoopService: ScheduledLoopService): void {
  const handlers = buildScheduledLoopHandlers(scheduledLoopService);
  createRegistryIpcHandlers(scheduledLoopEndpoints, handlers, 'Scheduled loop operation failed');
}
