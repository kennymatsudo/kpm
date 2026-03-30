import * as fs from 'fs';
import * as path from 'path';
import type { IProjectRepository } from '../../db/interfaces';
import type {
  OnboardingCallbacks,
  OnboardingService,
} from '../generation/OnboardingService';
import { failure, success, type ServiceResult } from '../result';
import { CONTEXT_FILE_NAMES } from '../../../shared/contextFile';

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

        // Persist the scoped directories for future regeneration
        const hasDirectories = Object.values(repoDirectories).some(dirs => dirs.length > 0);
        if (hasDirectories) {
          deps.projects.updateContextDirectories(projectId, repoDirectories);
        }

        // Read existing context file for update-aware generation
        let existingContext: string | null = null;
        for (const filename of CONTEXT_FILE_NAMES) {
          try {
            const filePath = path.join(project.folder_path, filename);
            existingContext = fs.readFileSync(filePath, 'utf-8');
            break;
          } catch {
            // File doesn't exist, try next
          }
        }

        deps.onboardingService.scanAndGenerate(
          {
            projectId: project.id,
            projectName: project.name,
            projectPath: project.folder_path,
            description,
            repoDirectories,
            existingContext,
          },
          callbacks,
        ).catch((error) => {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[OnboardingFacade] Unhandled generation error:', msg);
          callbacks.onError(`Generation failed: ${msg}`);
        });

        return success({ taskId });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    getContextDirectories(projectId: string): ServiceResult<Record<string, string[]> | null> {
      try {
        return success(deps.projects.getContextDirectories(projectId));
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
