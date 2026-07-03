/**
 * DevSession IPC handlers
 *
 * Handles renderer <-> main process communication for development sessions.
 */

import type { BrowserWindow } from 'electron';
import type { DevSessionService } from '../../services/repo/DevSessionService';
import { devSessionEndpoints, type DevSessionEndpointName } from '../../../shared/ipc/devSessionEndpoints';
import type { EndpointPayload } from '../../../shared/ipc/endpoints';
import { createRegistryIpcHandlers } from '../validation/utils';

type DevSessionHandler<K extends DevSessionEndpointName> = (
  params: EndpointPayload<(typeof devSessionEndpoints)[K]>,
  event: Electron.IpcMainInvokeEvent
) => unknown;

/**
 * One handler per `devSessionEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type DevSessionHandlers = { [K in DevSessionEndpointName]: DevSessionHandler<K> };

function buildDevSessionHandlers(devSessionService: DevSessionService): DevSessionHandlers {
  return {
    getByProject: ({ projectId }) => {
      const sessions = devSessionService.getByProject(projectId);
      return { sessions };
    },

    getByProjectWithPlanItems: ({ projectId }) => {
      const sessions = devSessionService.getByProjectWithPlanItems(projectId);
      return { sessions };
    },

    getActive: ({ projectId }) => {
      const sessions = devSessionService.getActiveSessions(projectId);
      return { sessions };
    },

    get: ({ sessionId }) => {
      const session = devSessionService.get(sessionId);
      return { session };
    },

    hasActive: ({ planItemId }) => {
      const hasActive = devSessionService.hasActiveSession(planItemId);
      return { hasActive };
    },

    openEditor: async ({ sessionId }) => {
      const result = await devSessionService.openInEditor(sessionId);
      if (!result.ok) {
        throw new Error(result.error);
      }
    },

    updateStatus: ({ sessionId, status }) => {
      devSessionService.updateStatus(sessionId, status);
    },

    delete: async ({ sessionId, cleanupWorktree }) => {
      const result = await devSessionService.deleteSession(sessionId, cleanupWorktree);
      if (!result.ok) {
        throw new Error(result.error);
      }
    },

    destroy: async ({ sessionId }) => {
      const result = await devSessionService.destroySession(sessionId);
      if (!result.ok) {
        throw new Error(result.error);
      }
    },

    checkDirty: async ({ sessionId }) => {
      const result = await devSessionService.checkDirty(sessionId);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },

    getDiff: async ({ sessionId }) => {
      const result = await devSessionService.getSessionDiff(sessionId);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return { diff: result.data };
    },

    getCommitsAhead: async ({ sessionId }) => {
      const result = await devSessionService.getCommitsAhead(sessionId);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return { count: result.data };
    },

    updateName: ({ sessionId, name }) => {
      devSessionService.updateName(sessionId, name);
    },

    getMergeOrder: ({ projectId }) => {
      return { mergeOrder: devSessionService.getMergeOrder(projectId) };
    },

    updateMergeOrder: ({ sessionId, order }) => {
      devSessionService.updateMergeOrder(sessionId, order);
    },
  };
}

/**
 * Register dev session IPC handlers
 */
export function registerDevSessionHandlers(
  devSessionService: DevSessionService,
  _getMainWindow: () => BrowserWindow | null,
): void {
  createRegistryIpcHandlers(
    devSessionEndpoints,
    buildDevSessionHandlers(devSessionService),
    'Dev session operation failed'
  );
}
