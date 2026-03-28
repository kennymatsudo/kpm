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

  return window.api.devSessions.checkDirty(sessionId);
}

  sessionId: string,
  mode: 'cleanup' | 'destroy'
): Promise<{ success: boolean; error?: string }> {
  return mode === 'destroy'
    ? window.api.devSessions.destroy(sessionId)
    : window.api.devSessions.delete(sessionId, true);
}

  session: DevSessionWithPlanItem
): Promise<{ success: boolean; error?: string }> {
  return window.api.devSessions.delete(session.id, false);
}

  session: DevSessionWithPlanItem,
  name: string
): Promise<{ success: boolean; error?: string }> {
  return window.api.devSessions.updateName(session.id, name);
}

  return window.api.devSessions.getDiff(sessionId);
}

export function subscribeToSessionStatusChanges(
  callback: (event: SessionStatusChangedEvent) => void
): () => void {
  return window.api.devSessions.onStatusChanged(callback);
}
