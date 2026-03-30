/**
 * IPC Handlers for Project Onboarding Wizard
 */

import { ipcMain, type BrowserWindow } from 'electron';
import { createIpcHandler, OnboardingSchemas } from '../validation';
import type { OnboardingFacadeService } from '../../services/core/OnboardingFacadeService';
import { IPC_CHANNELS } from '../channels';

export function registerOnboardingHandlers(
  getMainWindow: () => BrowserWindow | null,
  onboardingFacadeService: OnboardingFacadeService,
): void {
  ipcMain.handle(
    IPC_CHANNELS.onboarding.generate,
    createIpcHandler(
      OnboardingSchemas.generate,
      async ({ taskId, projectId, description, repoDirectories }) => {
        const mainWindow = getMainWindow();
        if (!mainWindow) {
          throw new Error('Main window not available');
        }

        const result = onboardingFacadeService.startGeneration(
          taskId,
          projectId,
          description,
          repoDirectories,
          {
            onProgress: (message: string) => {
              mainWindow.webContents.send('onboarding:progress', { taskId, message });
            },
            onThinking: (text: string) => {
              mainWindow.webContents.send('onboarding:thinking', { taskId, text });
            },
            onComplete: (content: string) => {
              mainWindow.webContents.send('onboarding:complete', { taskId, content });
            },
            onError: (error: string) => {
              mainWindow.webContents.send('onboarding:error', { taskId, error });
            },
          },
        );

        if (!result.ok) {
          throw new Error(result.error);
        }

        return result.data;
      },
      'Failed to start onboarding generation',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.onboarding.saveContext,
    createIpcHandler(
      OnboardingSchemas.saveContext,
      async ({ projectId, content }) => {
        const result = onboardingFacadeService.saveContext(projectId, content);
        if (!result.ok) {
          throw new Error(result.error);
        }
      },
      'Failed to save context',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.onboarding.getContextDirectories,
  );
}
