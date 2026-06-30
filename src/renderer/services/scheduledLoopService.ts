import type { LoopOutputMode } from '../../shared/types';

export function listScheduledLoops(projectId: string) {
  return window.api.scheduledLoops.list(projectId);
}

export function createScheduledLoop(input: {
  projectId: string;
  name: string;
  prompt: string;
  outputMode: LoopOutputMode;
  intervalMinutes: number;
  enabled?: boolean;
}) {
  return window.api.scheduledLoops.create(input);
}

export function updateScheduledLoop(
  id: string,
  updates: {
    name?: string;
    prompt?: string;
    outputMode?: LoopOutputMode;
    intervalMinutes?: number;
    enabled?: boolean;
  }
) {
  return window.api.scheduledLoops.update(id, updates);
}

export function setScheduledLoopEnabled(id: string, enabled: boolean) {
  return window.api.scheduledLoops.setEnabled(id, enabled);
}

export function deleteScheduledLoop(id: string) {
  return window.api.scheduledLoops.delete(id);
}

export function runScheduledLoopNow(id: string) {
  return window.api.scheduledLoops.runNow(id);
}

export function getScheduledLoopHistory(loopId: string, limit?: number) {
  return window.api.scheduledLoops.history(loopId, limit);
}

export function subscribeToScheduledLoopRun(
  callback: (data: { projectId: string; loopId: string; outcome: string }) => void
): () => void {
  return window.api.scheduledLoops.onRun(callback);
}
