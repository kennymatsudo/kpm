import * as path from 'path';
import * as nodeFs from 'fs';
import type { BrowserWindow } from 'electron';
import type { IRepositoryContainer } from '../../db/interfaces';
import { createRepoService } from '../repo/RepoService';
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
import type { AutomationPhaseMachine } from '../agents/automationPhaseMachine';
import { emitAppEvent } from '../../../shared/ipc/appEvents';
import { fileExplorerEvents } from '../../../shared/ipc/fileExplorerEvents';
import type { ClaudeUsageService } from '../core/ClaudeUsageService';
import type { ContextFileService } from '../core/ContextFileService';
import type { PlaybookService } from '../core/PlaybookService';
import type { BoardProvider } from '../../../shared/playbooks';
import type { ServiceResult } from '../result';

export interface RepoServicesCompositionDeps {
  container: IRepositoryContainer;
  repoWatcherService: RepoWatcherService;
  getMainWindow: () => BrowserWindow | null;
  userDataPath: string;
  agentSessionManager?: AgentSessionManager;
  phaseMachine: Pick<AutomationPhaseMachine, 'transition'>;
  getPromptContent: (key: string) => string;
  /** Wraps attached context files for prepending to agent prompts. */
  buildContextPrefix: (projectId: string, contextPaths: string[]) => ReturnType<ContextFileService['buildContextPrefix']>;
  /** Reads the project-level context file (AGENTS.md/CLAUDE.md) for prepending to agent prompts. */
  readProjectContextFile: (projectId: string) => ReturnType<ContextFileService['readProjectContextFile']>;
  /** Centralized Claude token + cost tracker. */
  claudeUsageService: ClaudeUsageService;
  fileSummaryService?: FileSummaryService;
  playbookService: Pick<PlaybookService, 'get' | 'getDefault'>;
  listBoardProviders: () => Promise<BoardProvider[]>;
  getSkillBody: (name: string) => ServiceResult<string>;
  resumePlaybook: (sessionId: string, options?: { note?: string; action?: 'resume' | 'proceed' | 'one_more_pass' }) => Promise<boolean>;
}

export function createRepoServices({
  container,
  repoWatcherService,
  getMainWindow,
  userDataPath,
  agentSessionManager,
  phaseMachine,
  getPromptContent,
  buildContextPrefix,
  readProjectContextFile,
  claudeUsageService,
  fileSummaryService,
  playbookService,
  listBoardProviders,
  getSkillBody,
  resumePlaybook,
}: RepoServicesCompositionDeps) {
  const repoService = createRepoService({
    repos: container.repos,
    watcher: repoWatcherService,
    fs: nodeFs,
    path,
    gitExec,
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
      emitAppEvent(window?.webContents, fileExplorerEvents.externalAccess, event);
    },
  });

  const devSessionService = createDevSessionService({
    devSessions: container.devSessions,
    planItems: container.planItems,
    planRelations: container.planRelations,
    projects: container.projects,
    repos: container.repos,
    appSettings: container.appSettings,
    agentReviews: container.agentReviews,
    userDataPath,
    agentSessionManager,
    phaseMachine,
    getPromptContent,
    buildContextPrefix,
    readProjectContextFile,
    playbookService,
    listBoardProviders,
    getSkillBody,
    resumePlaybook,
  });

  const gitHubService = createGitHubService({
    devSessions: container.devSessions,
    repos: container.repos,
    planItems: container.planItems,
    readProjectDocument: (projectId, documentPath) =>
      fileExplorerService.readFileAsync(projectId, documentPath),
    getPromptContent,
  });

  const reviewService = createReviewService({
    devSessions: container.devSessions,
    reviewTasks: container.reviewTasks,
    reviewOwnership: container.reviewOwnership,
    reviewSyncState: container.reviewSyncState,
    gitHubService,
    devSessionService,
    phaseMachine,
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
