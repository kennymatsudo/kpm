/**
 * Repository Interfaces for Dependency Injection
 *
 * These interfaces define the contracts for data access.
 * Implementations can be swapped for testing (mock) or production (SQLite).
 */

// Project domain
export type { IProjectRepository, IRepoRepository, IAttachmentRepository } from './project';

// Plan domain
export type { IPlanItemRepository, IPlanRelationRepository, IExternalPlanItemRepository } from './plan';

// Group domain
export type { IGroupRepository, GroupUpdates } from './group';

// Tracker domain
export type { ITrackerRepository, ISyncRepository, ISyncQueueRepository, ITypeMappingRepository } from './tracker';

// Chat domain
export type { IChatMessageRepository, IChatSessionRepository } from './chat';

// Development domain
export type { IDevSessionRepository, IWorktreeRepository } from './dev';

// Settings domain
export type {
  IAppSettingsRepository,
  ITaskPromptTemplateRepository,
  ICustomPromptRepository,
  IToolPermissionRepository,
  CustomPromptCreate,
  CustomPromptUpdate,
} from './settings';

// Confluence domain
export type { IConfluenceLinkRepository, ConfluencePageLink, ConfluenceLinkCreate, SyncState } from './confluence';

// Slack triage domain
export type {
  ISlackChannelLinkRepository,
  ISlackTriageItemRepository,
  SlackChannelLinkCreate,
  SlackTriageItemCreate,
} from './slack';

// Review workflow domain
export type {
  IReviewTaskRepository,
  IReviewOwnershipRepository,
  IReviewSyncStateRepository,
  ReviewTaskUpsert,
  ReviewTaskStatusUpdate,
  ReviewSyncStateUpsert,
} from './review';

// Container
export type { IRepositoryContainer } from './container';
