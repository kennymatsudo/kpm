/**
 * Renderer-side wrapper around the Claude usage IPC channels.
 * Thin pass-through; keep transformation logic in components/hooks.
 */

import type {
  ClaudeUsageEvent,
  ProjectUsageStats,
  UsageLiveEvent,
} from '../../shared/usage-types';

export function getProjectUsageStats(projectId: string): Promise<ProjectUsageStats> {
  return window.api.usage.getProjectStats(projectId);
}

export function getGlobalUsageStats(): Promise<ProjectUsageStats> {
  return window.api.usage.getGlobalStats();
}

export function listUsageEvents(projectId: string | null, limit?: number): Promise<ClaudeUsageEvent[]> {
  return window.api.usage.listEvents(projectId, limit);
}

export function resetProjectUsage(projectId: string): Promise<{ success: boolean }> {
  return window.api.usage.resetProject(projectId);
}

export function onUsageEvent(handler: (event: UsageLiveEvent) => void): () => void {
  return window.api.usage.onUsageEvent(handler);
}
