/**
 * Repository Container Interface
 *
 * The DI container holding all repository instances.
 */

import type { IProjectRepository, IRepoRepository, IAttachmentRepository } from './project';
import type { IPlanItemRepository, IPlanRelationRepository, IExternalPlanItemRepository } from './plan';
import type { ITrackerRepository, ISyncRepository, IOutboundChangeRepository, ITypeMappingRepository } from './tracker';
import type { IChatMessageRepository, IChatSessionRepository } from './chat';
import type { IDevSessionRepository } from './dev';
import type { IAppSettingsRepository, ICustomThemeRepository, ITaskPromptTemplateRepository, IProjectWriteGrantRepository } from './settings';
import type { IConfluenceLinkRepository } from './confluence';
import type { ILinearDocumentLinkRepository } from './linearDocuments';
import type { IAgentReviewRepository, IReviewOwnershipRepository, IReviewSyncStateRepository, IReviewTaskRepository } from './review';
import type { IClaudeUsageRepository } from './usage';
import type { IProjectFileMetadataRepository } from './files';
import type { IPlaybookRepository } from './playbook';
import type { IActionRepository, IActionRunRepository } from './actions';

/**
 * Container holding all repository instances.
 * This is the main entry point for accessing repositories.
 */
export interface IRepositoryContainer {
  projects: IProjectRepository;
  planItems: IPlanItemRepository;
  planRelations: IPlanRelationRepository;
  repos: IRepoRepository;
  attachments: IAttachmentRepository;
  tracker: ITrackerRepository;
  sync: ISyncRepository;
  outboundChanges: IOutboundChangeRepository;
  typeMappings: ITypeMappingRepository;
  externalPlanItems: IExternalPlanItemRepository;
  chatMessages: IChatMessageRepository;
  chatSessions: IChatSessionRepository;
  taskPromptTemplates: ITaskPromptTemplateRepository;
  appSettings: IAppSettingsRepository;
  customThemes: ICustomThemeRepository;
  devSessions: IDevSessionRepository;
  confluenceLinks: IConfluenceLinkRepository;
  linearDocumentLinks: ILinearDocumentLinkRepository;
  projectWriteGrants: IProjectWriteGrantRepository;
  reviewTasks: IReviewTaskRepository;
  agentReviews: IAgentReviewRepository;
  reviewOwnership: IReviewOwnershipRepository;
  reviewSyncState: IReviewSyncStateRepository;
  claudeUsage: IClaudeUsageRepository;
  projectFileMetadata: IProjectFileMetadataRepository;
  playbooks: IPlaybookRepository;
  actions: IActionRepository;
  actionRuns: IActionRunRepository;
}
