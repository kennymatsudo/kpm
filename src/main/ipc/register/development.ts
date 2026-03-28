import { registerWorktreeHandlers } from '../handlers/worktree';
import { registerGitHubHandlers } from '../handlers/github';
import { registerReviewHandlers } from '../handlers/review';
import { registerDevSessionHandlers } from '../handlers/devSessions';
import { registerFileExplorerHandlers } from '../handlers/fileExplorer';
import { registerRepoFileHandlers } from '../handlers/repoFiles';
import type { IpcRegistrationContext } from './types';

export function registerDevelopmentHandlers({
  getMainWindow,
  services,
}: IpcRegistrationContext): void {
  registerWorktreeHandlers(services.worktreeService);
  registerGitHubHandlers(services.gitHubService);
  registerFileExplorerHandlers(services.fileExplorerService, services.projectWatcherService, getMainWindow);
  registerRepoFileHandlers(services.repoFileService);
}
