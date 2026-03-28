import type { IProjectRepository } from '../../db/interfaces';
import type {
  OnboardingCallbacks,
  OnboardingService,
} from '../generation/OnboardingService';
import { failure, success, type ServiceResult } from '../result';

export interface OnboardingFacadeServiceDeps {
  projects: IProjectRepository;
  onboardingService: OnboardingService;
}

export function createOnboardingFacadeService(deps: OnboardingFacadeServiceDeps) {
  return {
    startGeneration(
      taskId: string,
      projectId: string,
      description: string,
      repoDirectories: Record<string, string[]>,
      callbacks: OnboardingCallbacks,
    ): ServiceResult<{ taskId: string }> {
      try {
        const project = deps.projects.get(projectId);
        if (!project) {
          return failure('Project not found');
        }

          {
            projectId: project.id,
            projectName: project.name,
            projectPath: project.folder_path,
            description,
            repoDirectories,
          },
          callbacks,

        return success({ taskId });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    saveContext(projectId: string, content: string): ServiceResult<void> {
      try {
        const result = deps.onboardingService.saveContext(projectId, content);
        if (!result.success) {
          return failure(result.error ?? 'Failed to save context');
        }
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export type OnboardingFacadeService = ReturnType<typeof createOnboardingFacadeService>;
