/**
 * Repository Container Interface
 *
 * The DI container holding all repository instances.
 */

import type { IProjectRepository, IRepoRepository, IAttachmentRepository } from './project';
import type { IPlanItemRepository, IPlanRelationRepository, IExternalPlanItemRepository } from './plan';
import type { ITrackerRepository, ISyncRepository, ISyncQueueRepository, ITypeMappingRepository } from './tracker';
import type { IDevSessionRepository, IWorktreeRepository } from './dev';

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
  syncQueue: ISyncQueueRepository;
  typeMappings: ITypeMappingRepository;
  externalPlanItems: IExternalPlanItemRepository;
  chatMessages: IChatMessageRepository;
  chatSessions: IChatSessionRepository;
  worktrees: IWorktreeRepository;
  appSettings: IAppSettingsRepository;
  devSessions: IDevSessionRepository;
}
