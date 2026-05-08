import { registerProjectHandlers } from '../handlers/projects';
import { registerRepoHandlers } from '../handlers/repos';
import { registerAttachmentHandlers } from '../handlers/attachments';
import { registerPlanHandlers } from '../handlers/plan';
import { registerGroupHandlers } from '../handlers/groups';
import { registerChatHandlers } from '../handlers/chat';
import { registerFileHandlers } from '../handlers/files';
import { registerExportHandlers } from '../handlers/export';
import { registerTrackerHandlers } from '../handlers/tracker';
import { registerSettingsHandlers } from '../handlers/settings';
import { registerCustomThemeHandlers } from '../handlers/customThemes';
import { registerPermissionHandlers } from '../handlers/permission';
import { registerArtifactHandlers } from '../handlers/artifacts';
import { registerTaskPromptTemplateHandlers } from '../handlers/taskPromptTemplates';
import { registerCustomPromptHandlers } from '../handlers/customPrompts';
import { registerOnboardingHandlers } from '../handlers/onboarding';
import { registerSlackHandlers } from '../handlers/slack';
import type { IpcRegistrationContext } from './types';

export function registerWorkspaceHandlers({
  getMainWindow,
  services,
  chatRuntime,
}: IpcRegistrationContext): void {
  registerProjectHandlers(services.projectService);
  registerRepoHandlers(getMainWindow, services.repoService);
  registerAttachmentHandlers(getMainWindow, services.attachmentService);
  registerPlanHandlers(services.planService);
  registerGroupHandlers(services.groupService);
  registerFileHandlers(getMainWindow, services.contextFileService);
  registerExportHandlers(services.exportFacadeService);
  registerTrackerHandlers(getMainWindow, services.trackerService);
  registerSettingsHandlers(services.settingsService);
  registerCustomThemeHandlers(services.customThemeService);
  registerPermissionHandlers(services.permissionService);
  registerArtifactHandlers(getMainWindow, services.artifactService);
  registerTaskPromptTemplateHandlers(services.taskPromptTemplateService);
  registerCustomPromptHandlers(getMainWindow, services.customPromptService);
  registerOnboardingHandlers(getMainWindow, services.onboardingFacadeService);
  registerSlackHandlers(services.slackTriageService);
}
