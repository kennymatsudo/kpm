import * as path from 'path';
import * as nodeFs from 'fs';
import type { IRepositoryContainer } from '../../db/interfaces';
import { createArtifactService } from '../core/ArtifactService';
import { createOnboardingService } from '../generation/OnboardingService';
import { createOnboardingFacadeService } from '../core/OnboardingFacadeService';
import type { ClaudeUsageService } from '../core/ClaudeUsageService';

export interface GenerationServicesCompositionDeps {
  container: IRepositoryContainer;
  getProjectFolder: (projectId: string) => string | null;
  /** Optional centralized Claude usage tracker. */
  claudeUsageService?: ClaudeUsageService;
}

export function createGenerationServices({
  container,
  getProjectFolder,
  claudeUsageService,
}: GenerationServicesCompositionDeps) {
  const onboardingService = createOnboardingService({
    getReposByProject: (projectId: string) => container.repos.getByProject(projectId),
    getProjectFolder,
    recordUsage: claudeUsageService
      ? ({ projectId, source, model, usage, totalCostUsd }) => {
          claudeUsageService.recordUsage({ projectId, source, model, usage, totalCostUsd });
        }
      : undefined,
  });

  const artifactService = createArtifactService({
    projects: container.projects,
    fs: nodeFs,
    path,
  });

  const onboardingFacadeService = createOnboardingFacadeService({
    projects: container.projects,
    onboardingService,
  });

  return {
    onboardingService,
    artifactService,
    onboardingFacadeService,
  };
}

export type GenerationServicesComposition = ReturnType<typeof createGenerationServices>;
