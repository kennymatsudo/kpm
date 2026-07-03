import type {
  DevSessionWithPlanItem,
} from '../../shared/types';

export interface SessionStatusChangedEvent {
  sessionId: string;
  projectId: string;
  status: string;
}

export interface SessionDirtyResult {
  success: boolean;
  isDirty?: boolean;
  files?: string[];
  error?: string;
}

export interface SessionDiffResult {
  success: boolean;
  diff?: string;
  error?: string;
}

export async function loadDevSessions(payload: { projectId: string }): Promise<{
  devSessions: DevSessionWithPlanItem[];
}> {
  const devResult = await window.api.devSessions.getByProjectWithPlanItems(payload);
  return {
    devSessions: devResult.success && devResult.sessions ? devResult.sessions : [],
  };
}

export function checkDevSessionDirty(payload: { sessionId: string }): Promise<SessionDirtyResult> {
  return window.api.devSessions.checkDirty(payload);
}

export function openDevSessionInEditor(
  payload: { sessionId: string }
): Promise<{ success: boolean; error?: string }> {
  return window.api.devSessions.openEditor(payload);
}

export function deleteDevSessionRecord(
  sessionId: string,
  mode: 'cleanup' | 'destroy'
): Promise<{ success: boolean; error?: string }> {
  return mode === 'destroy'
    ? window.api.devSessions.destroy({ sessionId })
    : window.api.devSessions.delete({ sessionId, cleanupWorktree: true });
}

export function dismissExistingSession(
  session: DevSessionWithPlanItem
): Promise<{ success: boolean; error?: string }> {
  return window.api.devSessions.delete({ sessionId: session.id, cleanupWorktree: false });
}

export function updateExistingSessionName(
  session: DevSessionWithPlanItem,
  name: string
): Promise<{ success: boolean; error?: string }> {
  return window.api.devSessions.updateName({ sessionId: session.id, name });
}

export function loadDevSessionDiff(payload: { sessionId: string }): Promise<SessionDiffResult> {
  return window.api.devSessions.getDiff(payload);
}

export interface MergeOrderEntry {
  layer: number | null;
  blockedBy: string[];
}

export function getDevSessionMergeOrder(
  payload: { projectId: string },
): Promise<{ success: boolean; mergeOrder?: Record<string, MergeOrderEntry>; error?: string }> {
  return window.api.devSessions.getMergeOrder(payload);
}

export function updateDevSessionMergeOrder(
  payload: { sessionId: string; order: number | null },
): Promise<{ success: boolean; error?: string }> {
  return window.api.devSessions.updateMergeOrder(payload);
}

export function subscribeToSessionStatusChanges(
  callback: (event: SessionStatusChangedEvent) => void
): () => void {
  return window.api.devSessions.onStatusChanged(callback);
}
