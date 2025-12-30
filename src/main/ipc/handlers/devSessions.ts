/**
 * DevSession IPC handlers
 *
 * Handles renderer <-> main process communication for development sessions.
 */

import type { DevSessionService } from '../../services/repo/DevSessionService';
import { DevSessionSchemas, createIpcHandler } from '../validation';
import { IPC_CHANNELS } from '../channels';

/**
 * Register dev session IPC handlers
 */
export function registerDevSessionHandlers(
  devSessionService: DevSessionService,
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

}
