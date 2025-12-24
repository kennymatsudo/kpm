/**
 * DevSession IPC handlers
 *
 */


/**
 * Register dev session IPC handlers
 */
export function registerDevSessionHandlers(
  devSessionService: DevSessionService,
): void {
  // Get all sessions for a project
  ipcMain.handle(
  );

  // Get sessions with plan item data for display
  ipcMain.handle(
  );

  // Get active sessions for a project
  ipcMain.handle(
  );

  // Get a session by ID
  ipcMain.handle(
  );

  // Check if a plan item has an active session
  ipcMain.handle(
  );

  // Update session status
  ipcMain.handle(
  );

  ipcMain.handle(
  );

  // Get git diff for a session
  ipcMain.handle(
  );

  // Get commits ahead count
  ipcMain.handle(
  );

}
