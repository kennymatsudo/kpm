import type { BrowserWindow } from 'electron';

/**
 * Register all IPC handlers.
 * @param getMainWindow - Function to get the main window (for handlers that need it)
 */
export function registerAllIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  services: AppServices
): void {

    getMainWindow,


  // Review sync is on-demand (triggered by renderer when Review view is opened)
}
