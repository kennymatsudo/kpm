import type { BrowserWindow } from 'electron';
import type { AppServices } from '../services/appServices';
import { registerWorkspaceHandlers } from './register/workspace';
import { registerDevelopmentHandlers } from './register/development';
import { registerPlatformHandlers } from './register/platform';
import { installTrustedIpcSenderGuard } from './senderValidation';

/**
 * Register all IPC handlers.
 * @param getMainWindow - Function to get the main window (for handlers that need it)
 * @param services - Application service container
 */
export function registerAllIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  services: AppServices
): void {
  installTrustedIpcSenderGuard();

  const chatRuntime = services.createChatRuntime(getMainWindow);
  services.appLifecycleService.attachChatRuntime(chatRuntime);

  const context = {
    getMainWindow,
    services,
    chatRuntime,
  };

  registerWorkspaceHandlers(context);
  registerDevelopmentHandlers(context);
  registerPlatformHandlers(context);

  // Review sync is on-demand (triggered by renderer when Review view is opened)
}
