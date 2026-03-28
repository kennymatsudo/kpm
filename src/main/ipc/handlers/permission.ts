/**
 * IPC handlers for permission system.
 *
 * Flow:
 * 1. Main process needs permission -> calls promptUser()
 * 2. promptUser() sends permission:request to renderer
 * 3. Renderer shows inline PermissionPrompt component
 * 4. User clicks action -> renderer sends permission:respond
 * 5. promptUser() resolves with PermissionResult
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../channels';
import type { PermissionService } from '../../services/core/PermissionService';
import { createIpcHandler, PermissionSchemas } from '../validation';
import { resolvePromptResponse } from '../../services/core/PermissionPromptService';

/**
 * Register permission IPC handlers.
 */
export function registerPermissionHandlers(permissionService: PermissionService): void {
  /**
   * Handle permission response from renderer.
   */
  ipcMain.handle(IPC_CHANNELS.permission.respond, createIpcHandler(
    PermissionSchemas.respond,
    async ({ requestId, projectId, action }) => {
      const result = resolvePromptResponse(permissionService, { requestId, projectId, action });
      if (!result.ok) throw new Error(result.error);
    },
    'Failed to respond to permission request',
  ));

  /**
   * List persisted permissions for a project.
   */
  ipcMain.handle(IPC_CHANNELS.permission.list, createIpcHandler(
    PermissionSchemas.list,
    ({ projectId }) => {
      const result = permissionService.list(projectId);
      if (!result.ok) throw new Error(result.error);
      return { permissions: result.data };
    },
    'Failed to list permissions',
  ));

  /**
   * Revoke a single permission by ID.
   */
  ipcMain.handle(IPC_CHANNELS.permission.revoke, createIpcHandler(
    PermissionSchemas.revoke,
    ({ id, projectId, cacheKey }) => {
      const result = permissionService.revoke(id, projectId, cacheKey);
      if (!result.ok) throw new Error(result.error);
    },
    'Failed to revoke permission',
  ));

  /**
   * Revoke all permissions for a project.
   */
  ipcMain.handle(IPC_CHANNELS.permission.revokeAll, createIpcHandler(
    PermissionSchemas.revokeAll,
    ({ projectId }) => {
      const result = permissionService.revokeAll(projectId);
      if (!result.ok) throw new Error(result.error);
    },
    'Failed to revoke all permissions',
  ));
}
