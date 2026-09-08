import type { PermissionAction, PermissionRequest } from '../../shared/types';
import type { PermissionSettled, WriteGrantChanged } from '../../shared/ipc/permissionEvents';

export function subscribeToWriteGrantChanges(
  callback: (change: WriteGrantChanged) => void
): () => void {
  return window.api.permission.onWriteGrantChanged(callback);
}

export async function getProjectWriteGrant(projectId: string): Promise<boolean> {
  const result = await window.api.permission.getWriteGrant({ projectId });
  return result.success && result.granted;
}

export function grantProjectWriteGrant(projectId: string): Promise<{ success: boolean }> {
  return window.api.permission.grantWriteGrant({ projectId });
}

export function revokeProjectWriteGrant(projectId: string): Promise<{ success: boolean }> {
  return window.api.permission.revokeWriteGrant({ projectId });
}

export function subscribeToPermissionRequests(
  callback: (request: PermissionRequest) => void
): () => void {
  return window.api.permission.onRequest(callback);
}

export function subscribeToPermissionSettled(
  callback: (settled: PermissionSettled) => void
): () => void {
  return window.api.permission.onSettled(callback);
}

export function respondToPermissionRequest(
  requestId: string,
  projectId: string,
  action: PermissionAction
): Promise<{ success: boolean; error?: string }> {
  return window.api.permission.respond({ requestId, projectId, action });
}

