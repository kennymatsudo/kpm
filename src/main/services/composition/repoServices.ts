import * as path from 'path';
import * as nodeFs from 'fs';
import type { BrowserWindow } from 'electron';
import type { IRepositoryContainer } from '../../db/interfaces';
import { createRepoService } from '../repo/RepoService';
import { createWorktreeService } from '../repo/WorktreeService';
import { createDevSessionService } from '../repo/DevSessionService';
import { createGitHubService } from '../repo/GitHubService';
import { createReviewService } from '../repo/ReviewService';
import { createReviewAssessmentService } from '../repo/ReviewAssessmentService';
import { gitExec } from '../repo/gitUtils';
import type { RepoWatcherService } from '../repo/RepoWatcherService';
import { createFileExplorerService } from '../files/FileExplorerService';
import { createProjectWatcherService } from '../files/ProjectWatcherService';
import { createRepoFileService } from '../files/RepoFileService';
import type { AgentSessionManager } from '../agents/AgentSessionManager';
import type { ClaudeUsageService } from '../core/ClaudeUsageService';

export interface RepoServicesCompositionDeps {
  container: IRepositoryContainer;
  repoWatcherService: RepoWatcherService;
  getMainWindow: () => BrowserWindow | null;
  userDataPath: string;
  agentSessionManager?: AgentSessionManager;
  getPromptContent: (key: string) => string;
  /** Centralized Claude token + cost tracker. */
  claudeUsageService: ClaudeUsageService;
}

export function createRepoServices({
  container,
  repoWatcherService,
  getMainWindow,
  userDataPath,
  agentSessionManager,
  getPromptContent,
  claudeUsageService,
}: RepoServicesCompositionDeps) {
  const repoService = createRepoService({
    repos: container.repos,
    watcher: repoWatcherService,
    fs: nodeFs,
    path,
    gitExec,
  });

  const worktreeService = createWorktreeService({
    worktrees: container.worktrees,
    planItems: container.planItems,
    projects: container.projects,
    repos: container.repos,
  });

  const getProjectFolder = (projectId: string) => {
    const project = container.projects.get(projectId);
    return project?.folder_path ?? null;
  };

  const fileExplorerService = createFileExplorerService({
    getProjectFolder,
  });

  const devSessionService = createDevSessionService({
    devSessions: container.devSessions,
    planItems: container.planItems,
    projects: container.projects,
    repos: container.repos,
    appSettings: container.appSettings,
    agentReviews: container.agentReviews,
    userDataPath,
    agentSessionManager,
    getPromptContent,
  });

  const gitHubService = createGitHubService({
    devSessions: container.devSessions,
    repos: container.repos,
    planItems: container.planItems,
    getPromptContent,
    recordUsage: ({ projectId, source, model, usage, totalCostUsd }) => {
      claudeUsageService.recordUsage({ projectId, source, model, usage, totalCostUsd });
    },
  });

  const reviewService = createReviewService({
    devSessions: container.devSessions,
    reviewTasks: container.reviewTasks,
    reviewOwnership: container.reviewOwnership,
    reviewSyncState: container.reviewSyncState,
    gitHubService,
    devSessionService,
  });

  const reviewAssessmentService = createReviewAssessmentService({
    devSessions: container.devSessions,
    repos: container.repos,
    planItems: container.planItems,
    planRelations: container.planRelations,
    reviewTasks: container.reviewTasks,
    gitHubService,
    fileExplorerService,
    recordUsage: ({ projectId, source, model, usage, totalCostUsd }) => {
      claudeUsageService.recordUsage({ projectId, source, model, usage, totalCostUsd });
    },
  });

  const projectWatcherService = createProjectWatcherService({
    getMainWindow,
    getProjectFolder,
  });

  const repoFileService = createRepoFileService({
    getRepoById: (repoId: string) => container.repos.getById(repoId) ?? null,
  });

  return {
    repoService,
    worktreeService,
    fileExplorerService,
    devSessionService,
    gitHubService,
    reviewService,
    reviewAssessmentService,
    projectWatcherService,
    repoFileService,
    getProjectFolder,
  };
}

export type RepoServicesComposition = ReturnType<typeof createRepoServices>;
