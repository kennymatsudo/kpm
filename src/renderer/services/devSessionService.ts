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

export async function loadDevSessions(projectId: string): Promise<{
  devSessions: DevSessionWithPlanItem[];
}> {
  const devResult = await window.api.devSessions.getByProjectWithPlanItems(projectId);
  return {
    devSessions: devResult.success && devResult.sessions ? devResult.sessions : [],
  };
}

export function checkDevSessionDirty(sessionId: string): Promise<SessionDirtyResult> {
  return window.api.devSessions.checkDirty(sessionId);
}

export function openDevSessionInEditor(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  return window.api.devSessions.openEditor(sessionId);
}

export function deleteDevSessionRecord(
  sessionId: string,
  mode: 'cleanup' | 'destroy'
): Promise<{ success: boolean; error?: string }> {
  return mode === 'destroy'
    ? window.api.devSessions.destroy(sessionId)
    : window.api.devSessions.delete(sessionId, true);
}

export function dismissExistingSession(
  session: DevSessionWithPlanItem
): Promise<{ success: boolean; error?: string }> {
  return window.api.devSessions.delete(session.id, false);
}

export function updateExistingSessionName(
  session: DevSessionWithPlanItem,
  name: string
): Promise<{ success: boolean; error?: string }> {
  return window.api.devSessions.updateName(session.id, name);
}

export function loadDevSessionDiff(sessionId: string): Promise<SessionDiffResult> {
  return window.api.devSessions.getDiff(sessionId);
}

export interface MergeOrderEntry {
  layer: number | null;
  blockedBy: string[];
}

export function getDevSessionMergeOrder(
  projectId: string,
): Promise<{ success: boolean; mergeOrder?: Record<string, MergeOrderEntry>; error?: string }> {
  return window.api.devSessions.getMergeOrder(projectId);
}

export function updateDevSessionMergeOrder(
  sessionId: string,
  order: number | null,
): Promise<{ success: boolean; error?: string }> {
  return window.api.devSessions.updateMergeOrder(sessionId, order);
}

export function subscribeToSessionStatusChanges(
  callback: (event: SessionStatusChangedEvent) => void
): () => void {
  return window.api.devSessions.onStatusChanged(callback);
}
