/**
 * Claude Usage Tracking IPC Handlers
 *
 * Read-only queries against the centralized usage event log, plus a
 * destructive `resetProject` handler that clears events for a single project.
 */

import { ipcMain } from 'electron';
import { usageEndpoints, type UsageEndpointName } from '../../../shared/ipc/usageEndpoints';
import type { HandlerFor } from '../../../shared/ipc/endpoints';
import type { ClaudeUsageService } from '../../services/core/ClaudeUsageService';

/**
 * One handler per `usageEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type UsageHandlers = { [K in UsageEndpointName]: HandlerFor<typeof usageEndpoints, K> };

export function buildUsageHandlers(claudeUsageService: ClaudeUsageService): UsageHandlers {
  return {
    getProjectStats: ({ projectId }) => claudeUsageService.getProjectStats(projectId),

    getGlobalStats: () => claudeUsageService.getGlobalStats(),

    listEvents: ({ projectId, limit }) => claudeUsageService.listRecentEvents(projectId, limit ?? 100),

    getDevSessionStepCosts: ({ devSessionId }) => ({
      costs: claudeUsageService.getBoardPlaybookStepCosts(devSessionId),
    }),

    resetProject: ({ projectId }) => {
      claudeUsageService.resetProject(projectId);
      return { success: true };
    },
  };
}

export function registerUsageHandlers(claudeUsageService: ClaudeUsageService): void {
  const handlers = buildUsageHandlers(claudeUsageService);

  for (const [name, { channel, params }] of Object.entries(usageEndpoints) as [
    UsageEndpointName,
    (typeof usageEndpoints)[UsageEndpointName],
  ][]) {
    // Each handler's parameter type was checked once against its own
    // registry entry in `buildUsageHandlers`; iterating erases that
    // per-key correlation into a union, hence the cast here.
    const handler = handlers[name] as (params: unknown, event: Electron.IpcMainInvokeEvent) => unknown;
    ipcMain.handle(channel, async (event, rawParams: unknown) => {
      const parsedParams = params ? params.parse(rawParams) : undefined;
      return handler(parsedParams, event);
    });
  }
}
