/**
 * IPC Handlers for Project Onboarding Wizard
 */

import type { BrowserWindow } from 'electron';
import { createRegistryIpcHandlers } from '../validation/utils';
import { onboardingEndpoints, type OnboardingEndpointName } from '../../../shared/ipc/onboardingEndpoints';
import type { EndpointPayload } from '../../../shared/ipc/endpoints';
import type { OnboardingService } from '../../services/generation/OnboardingService';

type OnboardingHandler<K extends OnboardingEndpointName> = (
  params: EndpointPayload<(typeof onboardingEndpoints)[K]>
) => unknown;

/**
 * One handler per `onboardingEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type OnboardingHandlers = { [K in OnboardingEndpointName]: OnboardingHandler<K> };

function buildOnboardingHandlers(
  getMainWindow: () => BrowserWindow | null,
  onboardingService: OnboardingService,
): OnboardingHandlers {
  return {
    generate: async ({ taskId, projectId, description, repoDirectories }) => {
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

    saveContext: async ({ projectId, content }) => {
      const result = onboardingService.saveContext(projectId, content);
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to save context');
      }
    },

    saveContextDirectories: async ({ projectId, repoDirectories }) => {
      onboardingService.saveContextDirectories(projectId, repoDirectories);
    },

    getContextDirectories: ({ projectId }) => {
      const directories = onboardingService.getContextDirectories(projectId);
      return { directories };
    },
  };
}

export function registerOnboardingHandlers(
  getMainWindow: () => BrowserWindow | null,
  onboardingService: OnboardingService,
): void {
  createRegistryIpcHandlers(
    onboardingEndpoints,
    buildOnboardingHandlers(getMainWindow, onboardingService),
    'Onboarding operation failed'
  );
}
