/**
 * DevSession IPC handlers
 *
 * Handles renderer <-> main process communication for development sessions.
 */

import { ipcMain, type BrowserWindow } from 'electron';
import type { DevSessionService } from '../../services/repo/DevSessionService';
import { DevSessionSchemas, createIpcHandler } from '../validation';
import { IPC_CHANNELS } from '../channels';

/**
 * Register dev session IPC handlers
 */
export function registerDevSessionHandlers(
  devSessionService: DevSessionService,
  _getMainWindow: () => BrowserWindow | null,
): void {
  // Get all sessions for a project
  ipcMain.handle(
    IPC_CHANNELS.devSession.getByProject,
    createIpcHandler(
      DevSessionSchemas.getByProject,
      ({ projectId }) => {
        const sessions = devSessionService.getByProject(projectId);
        return { sessions };
      },
      'Failed to get sessions by project'
    )
  );

  // Get sessions with plan item data for display
  ipcMain.handle(
    IPC_CHANNELS.devSession.getByProjectWithPlanItems,
    createIpcHandler(
      DevSessionSchemas.getByProjectWithPlanItems,
      ({ projectId }) => {
        const sessions = devSessionService.getByProjectWithPlanItems(projectId);
        return { sessions };
      },
      'Failed to get sessions with plan items'
    )
  );

  // Get active sessions for a project
  ipcMain.handle(
    IPC_CHANNELS.devSession.getActive,
    createIpcHandler(
      DevSessionSchemas.getActive,
      ({ projectId }) => {
        const sessions = devSessionService.getActiveSessions(projectId);
        return { sessions };
      },
      'Failed to get active sessions'
    )
  );

  // Get a session by ID
  ipcMain.handle(
    IPC_CHANNELS.devSession.get,
    createIpcHandler(
      DevSessionSchemas.get,
      ({ sessionId }) => {
        const session = devSessionService.get(sessionId);
        return { session };
      },
      'Failed to get session'
    )
  );

  // Check if a plan item has an active session
  ipcMain.handle(
    IPC_CHANNELS.devSession.hasActive,
    createIpcHandler(
      DevSessionSchemas.hasActive,
      ({ planItemId }) => {
        const hasActive = devSessionService.hasActiveSession(planItemId);
        return { hasActive };
      },
      'Failed to check active session'
    )
  );

  // Open a session worktree in the user's editor
  ipcMain.handle(
    IPC_CHANNELS.devSession.openEditor,
    createIpcHandler(
      DevSessionSchemas.openEditor,
      async ({ sessionId }) => {
        const result = await devSessionService.openInEditor(sessionId);
        if (!result.ok) {
          throw new Error(result.error);
        }
      },
      'Failed to open session in editor'
    )
  );

  // Update session status
  ipcMain.handle(
    IPC_CHANNELS.devSession.updateStatus,
    createIpcHandler(
      DevSessionSchemas.updateStatus,
      ({ sessionId, status }) => {
        devSessionService.updateStatus(sessionId, status);
      },
      'Failed to update session status'
    )
  );

  // Delete a session (removes record, optionally cleans worktree)
  ipcMain.handle(
    IPC_CHANNELS.devSession.delete,
    createIpcHandler(
      DevSessionSchemas.delete,
      async ({ sessionId, cleanupWorktree }) => {
        const result = await devSessionService.deleteSession(sessionId, cleanupWorktree);
        if (!result.ok) {
          throw new Error(result.error);
        }
      },
      'Failed to delete session'
    )
  );

  // Destroy a session completely (force-delete worktree, branch + remote)
  ipcMain.handle(
    IPC_CHANNELS.devSession.destroy,
    createIpcHandler(
      DevSessionSchemas.destroy,
      async ({ sessionId }) => {
        const result = await devSessionService.destroySession(sessionId);
        if (!result.ok) {
          throw new Error(result.error);
        }
      },
      'Failed to destroy session'
    )
  );

  // Check if session has uncommitted changes
  ipcMain.handle(
    IPC_CHANNELS.devSession.checkDirty,
    createIpcHandler(
      DevSessionSchemas.checkDirty,
      async ({ sessionId }) => {
        const result = await devSessionService.checkDirty(sessionId);
        if (!result.ok) {
          throw new Error(result.error);
        }
        return result.data;
      },
      'Failed to check dirty status'
    )
  );

  // Get git diff for a session
  ipcMain.handle(
    IPC_CHANNELS.devSession.getDiff,
    createIpcHandler(
      DevSessionSchemas.getDiff,
      async ({ sessionId }) => {
        const result = await devSessionService.getSessionDiff(sessionId);
        if (!result.ok) {
          throw new Error(result.error);
        }
        return { diff: result.data };
      },
      'Failed to get session diff'
    )
  );

  // Get commits ahead count
  ipcMain.handle(
    IPC_CHANNELS.devSession.getCommitsAhead,
    createIpcHandler(
      DevSessionSchemas.getCommitsAhead,
      async ({ sessionId }) => {
        const result = await devSessionService.getCommitsAhead(sessionId);
        if (!result.ok) {
          throw new Error(result.error);
        }
        return { count: result.data };
      },
      'Failed to get commits ahead'
    )
  );

  // Update session name
  ipcMain.handle(
    IPC_CHANNELS.devSession.updateName,
    createIpcHandler(
      DevSessionSchemas.updateName,
      ({ sessionId, name }) => {
        devSessionService.updateName(sessionId, name);
      },
      'Failed to update session name'
    )
  );

  // Get computed merge order for all sessions in a project
  ipcMain.handle(
    IPC_CHANNELS.devSession.getMergeOrder,
    createIpcHandler(
      DevSessionSchemas.getMergeOrder,
      ({ projectId }) => {
        return { mergeOrder: devSessionService.getMergeOrder(projectId) };
      },
      'Failed to compute merge order'
    )
  );

  // Update user-explicit merge order override
  ipcMain.handle(
    IPC_CHANNELS.devSession.updateMergeOrder,
    createIpcHandler(
      DevSessionSchemas.updateMergeOrder,
      ({ sessionId, order }) => {
        devSessionService.updateMergeOrder(sessionId, order);
      },
      'Failed to update merge order'
    )
  );

}
