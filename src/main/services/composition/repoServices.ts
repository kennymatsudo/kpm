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
import { getConfig } from '../../config';
import { resolveScopedPath } from '../files/scopedFs';
import type { FileSummaryService } from '../files/FileSummaryService';
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
  fileSummaryService?: FileSummaryService;
}

export function createRepoServices({
  container,
  repoWatcherService,
  getMainWindow,
  userDataPath,
  agentSessionManager,
  getPromptContent,
  claudeUsageService,
  fileSummaryService,
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
    fileSummaryService,
    getPlanItems: (projectId) => container.planItems.getByProject(projectId),
    onExternalAccess: (event) => {
      const window = getMainWindow();
      window?.webContents.send('file-explorer:external-access', event);
    },
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
    onExternalFileChange: fileSummaryService
      ? ({ projectId, type, path: filePath, isDirectory }) => {
          if (isDirectory) {
            if (type === 'deleted') fileSummaryService.deleteFolder(projectId, filePath);
            return;
          }
          if (type === 'deleted') {
            fileSummaryService.deleteEntry(projectId, filePath);
          } else {
            if (!fileSummaryService.shouldSummarizePath(filePath)) {
              fileSummaryService.deleteEntry(projectId, filePath);
              return;
            }

            const projectFolder = getProjectFolder(projectId);
            if (projectFolder) {
              const scopedPath = resolveScopedPath(projectFolder, filePath);
              if (scopedPath.valid) {
                fileSummaryService.enqueueFileFromDisk(projectId, filePath, scopedPath.fullPath, getConfig().watcher.summarizationDebounceMs);
              }
            }
          }
        }
      : undefined,
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
