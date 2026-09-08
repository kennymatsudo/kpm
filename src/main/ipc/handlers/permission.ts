/**
 * IPC handlers for permission system.
 *
 * Flow:
 * 1. Main process needs permission -> calls promptUser()
 * 2. promptUser() sends permission:request to renderer
 * 3. Renderer shows inline PermissionPrompt component
 * 4. User clicks action -> renderer sends permission:respond
 * 5. promptUser() resolves with PermissionResult
 *
 * The write grant is also settable directly, without a prompt, for the
 * settings toggle.
 */

import type { BrowserWindow } from 'electron';
import { permissionEndpoints, type PermissionEndpointName } from '../../../shared/ipc/permissionEndpoints';
import { permissionEvents } from '../../../shared/ipc/permissionEvents';
import { emitAppEvent } from '../../../shared/ipc/appEvents';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';
import type { PermissionService } from '../../services/core/PermissionService';
import { resolvePromptResponse } from '../../services/core/PermissionPromptService';
import { projectWriteGrants } from '../../chat/writeGrants';
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
      const result = resolvePromptResponse({ requestId, projectId, action });
      if (!result.ok) throw new Error(result.error);
    },

    getWriteGrant: ({ projectId }) => {
      const result = permissionService.isGranted(projectId);
      if (!result.ok) throw new Error(result.error);
      return { granted: result.data };
    },

    grantWriteGrant: ({ projectId }) => {
      const result = permissionService.grant(projectId);
      if (!result.ok) throw new Error(result.error);
    },

    revokeWriteGrant: ({ projectId }) => {
      const result = permissionService.revoke(projectId);
      if (!result.ok) throw new Error(result.error);
    },
  };
}

/**
 * Register permission IPC handlers.
 */
export function registerPermissionHandlers(
  permissionService: PermissionService,
  getMainWindow: () => BrowserWindow | null,
): void {
  createRegistryIpcHandlers(permissionEndpoints, buildPermissionHandlers(permissionService), 'Permission operation failed');

  projectWriteGrants.subscribe((projectId, granted) => {
    emitAppEvent(getMainWindow()?.webContents, permissionEvents.writeGrantChanged, { projectId, granted });
  });
}
