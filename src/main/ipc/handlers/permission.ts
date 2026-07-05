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

import { permissionEndpoints, type PermissionEndpointName } from '../../../shared/ipc/permissionEndpoints';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';
import type { PermissionService } from '../../services/core/PermissionService';
import { resolvePromptResponse } from '../../services/core/PermissionPromptService';
import { createRegistryIpcHandlers } from '../validation/utils';

/**
 * One handler per `permissionEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type PermissionHandlers = { [K in PermissionEndpointName]: UnwrappedHandlerFor<typeof permissionEndpoints, K> };

function buildPermissionHandlers(permissionService: PermissionService): PermissionHandlers {
  return {
    /** Handle permission response from renderer. */
    respond: async ({ requestId, projectId, action }) => {
      const result = resolvePromptResponse(permissionService, { requestId, projectId, action });
      if (!result.ok) throw new Error(result.error);
    },

    /** List persisted permissions for a project. */
    list: ({ projectId }) => {
      const result = permissionService.list(projectId);
      if (!result.ok) throw new Error(result.error);
      return { permissions: result.data };
    },

    /** Revoke a single permission by ID. */
    revoke: ({ id, projectId, cacheKey }) => {
      const result = permissionService.revoke(id, projectId, cacheKey);
      if (!result.ok) throw new Error(result.error);
    },

    /** Revoke all permissions for a project. */
    revokeAll: ({ projectId }) => {
      const result = permissionService.revokeAll(projectId);
      if (!result.ok) throw new Error(result.error);
    },
  };
}

/**
 * Register permission IPC handlers.
 */
export function registerPermissionHandlers(permissionService: PermissionService): void {
  createRegistryIpcHandlers(permissionEndpoints, buildPermissionHandlers(permissionService), 'Permission operation failed');
}
