/**
 * IPC Handlers for Project Onboarding Wizard
 */

import { ipcMain, type BrowserWindow } from 'electron';
import { createIpcHandler, OnboardingSchemas } from '../validation';
import { IPC_CHANNELS } from '../channels';

export function registerOnboardingHandlers(
  getMainWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(
    IPC_CHANNELS.onboarding.generate,
    createIpcHandler(
      OnboardingSchemas.generate,
        const mainWindow = getMainWindow();
        if (!mainWindow) {
          throw new Error('Main window not available');
        }

          {
            onProgress: (message: string) => {
              mainWindow.webContents.send('onboarding:progress', { taskId, message });
            },
            onComplete: (content: string) => {
              mainWindow.webContents.send('onboarding:complete', { taskId, content });
            },
            onError: (error: string) => {
              mainWindow.webContents.send('onboarding:error', { taskId, error });
            },
          },
        );

      },
      'Failed to start onboarding generation',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.onboarding.saveContext,
    createIpcHandler(
      OnboardingSchemas.saveContext,
      async ({ projectId, content }) => {
      },
      'Failed to save context',
    ),
  );
}
