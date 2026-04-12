import type { PermissionAction, PermissionRequest, ToolPermission } from '../../shared/types';

export function subscribeToPermissionRequests(
  callback: (request: PermissionRequest) => void
): () => void {
  return window.api.permission.onRequest(callback);
}

export function respondToPermissionRequest(
  requestId: string,
  projectId: string,
  action: PermissionAction
  return window.api.permission.respond(requestId, projectId, action);
}

export function listToolPermissions(projectId: string): Promise<ToolPermission[]> {
  return window.api.permissions?.list(projectId) ?? Promise.resolve([]);
}

export function revokeToolPermission(
  permissionId: string,
  projectId: string,
  cacheKey: string
  return window.api.permissions.revoke(permissionId, projectId, cacheKey);
}

  return window.api.permissions.revokeAll(projectId);
}
