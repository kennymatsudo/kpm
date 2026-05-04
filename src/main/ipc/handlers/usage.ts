/**
 * Claude Usage Tracking IPC Handlers
 *
 * Read-only queries against the centralized usage event log, plus a
 * destructive `resetProject` handler that clears events for a single project.
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../channels';
import { UsageSchemas } from '../validation/usage';
import type { ClaudeUsageService } from '../../services/core/ClaudeUsageService';

export function registerUsageHandlers(claudeUsageService: ClaudeUsageService): void {
  ipcMain.handle(IPC_CHANNELS.usage.getProjectStats, (_event, params: unknown) => {
    const { projectId } = UsageSchemas.getProjectStats.parse(params);
    return claudeUsageService.getProjectStats(projectId);
  });

  ipcMain.handle(IPC_CHANNELS.usage.getGlobalStats, (_event, params: unknown) => {
    UsageSchemas.getGlobalStats.parse(params);
    return claudeUsageService.getGlobalStats();
  });

  ipcMain.handle(IPC_CHANNELS.usage.listEvents, (_event, params: unknown) => {
    const { projectId, limit } = UsageSchemas.listEvents.parse(params);
    return claudeUsageService.listRecentEvents(projectId, limit ?? 100);
  });

  ipcMain.handle(IPC_CHANNELS.usage.resetProject, (_event, params: unknown) => {
    const { projectId } = UsageSchemas.resetProject.parse(params);
    claudeUsageService.resetProject(projectId);
    return { success: true };
  });
}
