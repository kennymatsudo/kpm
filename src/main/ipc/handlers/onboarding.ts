/**
 * IPC Handlers for Project Onboarding Wizard
 */

import { ipcMain, type BrowserWindow } from 'electron';
import { createIpcHandler, OnboardingSchemas } from '../validation';
import type { OnboardingService } from '../../services/generation/OnboardingService';
import { IPC_CHANNELS } from '../channels';

export function registerOnboardingHandlers(
  getMainWindow: () => BrowserWindow | null,
  onboardingService: OnboardingService,
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

        return onboardingService.startGeneration(
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
      },
      'Failed to start onboarding generation',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.onboarding.saveContext,
    createIpcHandler(
      OnboardingSchemas.saveContext,
      async ({ projectId, content }) => {
        const result = onboardingService.saveContext(projectId, content);
        if (!result.success) {
          throw new Error(result.error ?? 'Failed to save context');
        }
      },
      'Failed to save context',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.onboarding.saveContextDirectories,
    createIpcHandler(
      OnboardingSchemas.saveContextDirectories,
      async ({ projectId, repoDirectories }) => {
        onboardingService.saveContextDirectories(projectId, repoDirectories);
      },
      'Failed to save context directories',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.onboarding.getContextDirectories,
    createIpcHandler(
      OnboardingSchemas.saveContext.pick({ projectId: true }),
      ({ projectId }) => {
        const directories = onboardingService.getContextDirectories(projectId);
        return { directories };
      },
      'Failed to get context directories',
    ),
  );
}
