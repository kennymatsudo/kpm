/**
 * Repository Container Interface
 *
 * The DI container holding all repository instances.
 */

import type { IProjectRepository, IRepoRepository, IAttachmentRepository } from './project';
import type { IPlanItemRepository, IPlanRelationRepository, IExternalPlanItemRepository } from './plan';
import type { IGroupRepository } from './group';
import type { ITrackerRepository, ISyncRepository, ISyncQueueRepository, ITypeMappingRepository } from './tracker';
import type { IChatMessageRepository, IChatSessionRepository } from './chat';
import type { IDevSessionRepository, IWorktreeRepository } from './dev';
import type { IAppSettingsRepository, ICustomThemeRepository, ITaskPromptTemplateRepository, ICustomPromptRepository, IToolPermissionRepository } from './settings';
import type { IConfluenceLinkRepository } from './confluence';
import type { IAgentReviewRepository, IReviewOwnershipRepository, IReviewSyncStateRepository, IReviewTaskRepository } from './review';
import type { ISlackChannelLinkRepository, ISlackTriageItemRepository } from './slack';
import type { IClaudeUsageRepository } from './usage';

/**
 * Container holding all repository instances.
 * This is the main entry point for accessing repositories.
 */
export interface IRepositoryContainer {
  projects: IProjectRepository;
  planItems: IPlanItemRepository;
  planRelations: IPlanRelationRepository;
  groups: IGroupRepository;
  repos: IRepoRepository;
  attachments: IAttachmentRepository;
  tracker: ITrackerRepository;
  sync: ISyncRepository;
  syncQueue: ISyncQueueRepository;
  typeMappings: ITypeMappingRepository;
  externalPlanItems: IExternalPlanItemRepository;
  chatMessages: IChatMessageRepository;
  chatSessions: IChatSessionRepository;
  taskPromptTemplates: ITaskPromptTemplateRepository;
  customPrompts: ICustomPromptRepository;
  worktrees: IWorktreeRepository;
  appSettings: IAppSettingsRepository;
  customThemes: ICustomThemeRepository;
  devSessions: IDevSessionRepository;
  confluenceLinks: IConfluenceLinkRepository;
  toolPermissions: IToolPermissionRepository;
  reviewTasks: IReviewTaskRepository;
  agentReviews: IAgentReviewRepository;
  reviewOwnership: IReviewOwnershipRepository;
  reviewSyncState: IReviewSyncStateRepository;
  slackChannelLinks: ISlackChannelLinkRepository;
  slackTriageItems: ISlackTriageItemRepository;
  claudeUsage: IClaudeUsageRepository;
}
