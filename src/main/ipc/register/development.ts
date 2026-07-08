import { registerGitHubHandlers } from '../handlers/github';
import { registerReviewHandlers } from '../handlers/review';
import { registerDevSessionHandlers } from '../handlers/devSessions';
import { registerFileExplorerHandlers } from '../handlers/fileExplorer';
import { registerRepoFileHandlers } from '../handlers/repoFiles';
import { registerAgentSessionHandlers } from '../handlers/agentSessions';
import type { IpcRegistrationContext } from './types';

export function registerDevelopmentHandlers({
  getMainWindow,
  services,
}: IpcRegistrationContext): void {
  registerGitHubHandlers(services.gitHubService);
  registerReviewHandlers(services.reviewService, services.reviewAssessmentService, services.reviewPollService);
  registerDevSessionHandlers(services.devSessionService, getMainWindow);
  registerFileExplorerHandlers(services.fileExplorerService, services.projectWatcherService, getMainWindow);
  registerRepoFileHandlers(services.repoFileService);
  registerAgentSessionHandlers(
    services.agentSessionManager,
    services.devSessionService,
    services.promptOverrideService,
    services.claudeUsageService,
    services.phaseMachine,
  );
}
