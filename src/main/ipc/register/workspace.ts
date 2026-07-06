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
import { registerThemeHandlers } from '../handlers/theme';
import { registerPermissionHandlers } from '../handlers/permission';
import { registerArtifactHandlers } from '../handlers/artifacts';
import { registerTaskPromptTemplateHandlers } from '../handlers/taskPromptTemplates';
import { registerCustomPromptHandlers } from '../handlers/customPrompts';
import { registerScheduledLoopHandlers } from '../handlers/scheduledLoops';
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
  registerPlanHandlers(services.planService, services.container.planItems, services.container.planRelations);
  registerGroupHandlers(services.groupService, services.container.groups);
  registerChatHandlers({
    chatService: chatRuntime.chatService,
    slashCommandService: services.slashCommandService,
    permissionService: services.permissionService,
    streamingSessionService: chatRuntime.streamingSessionService,
    projects: services.container.projects,
    chatMessages: services.container.chatMessages,
  });
  registerFileHandlers(getMainWindow, services.contextFileService);
  registerExportHandlers(services.exportService, services.typeMappingService);
  registerTrackerHandlers(getMainWindow, services.trackerService);
  registerSettingsHandlers(services.settingsService);
  registerCustomThemeHandlers(services.customThemeService);
  registerThemeHandlers();
  registerPermissionHandlers(services.permissionService);
  registerArtifactHandlers(getMainWindow, services.artifactService);
  registerTaskPromptTemplateHandlers(services.taskPromptTemplateService);
  registerCustomPromptHandlers(getMainWindow, services.customPromptService);
  registerScheduledLoopHandlers(services.scheduledLoopService);
  registerOnboardingHandlers(getMainWindow, services.onboardingService);
  registerSlackHandlers(services.slackTriageService);
}
