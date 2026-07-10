/**
 * Dependency Injection Container
 *
 * This file provides the factory function for creating repository instances.
 * It wires up all dependencies and provides both production and test configurations.
 */

import type { Database } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { IRepositoryContainer } from './interfaces';
import { getDatabase, getUserDataPath } from './connection';
import {
  ProjectRepository as ProjectRepositoryClass,
  PlanItemRepository as PlanItemRepositoryClass,
  PlanRelationRepository as PlanRelationRepositoryClass,
  GroupRepository as GroupRepositoryClass,
  RepoRepository as RepoRepositoryClass,
  AttachmentRepository as AttachmentRepositoryClass,
  TrackerRepository as TrackerRepositoryClass,
  SyncRepository as SyncRepositoryClass,
  SyncQueueRepository as SyncQueueRepositoryClass,
  TypeMappingRepository as TypeMappingRepositoryClass,
  ExternalPlanItemRepository as ExternalPlanItemRepositoryClass,
  ChatMessageRepository as ChatMessageRepositoryClass,
  ChatSessionRepository as ChatSessionRepositoryClass,
  TaskPromptTemplateRepository as TaskPromptTemplateRepositoryClass,
  CustomPromptRepository as CustomPromptRepositoryClass,
  AppSettingsRepository as AppSettingsRepositoryClass,
  CustomThemeRepository as CustomThemeRepositoryClass,
  DevSessionRepository as DevSessionRepositoryClass,
  ConfluenceLinkRepository as ConfluenceLinkRepositoryClass,
  ToolPermissionRepository as ToolPermissionRepositoryClass,
  ReviewTaskRepository as ReviewTaskRepositoryClass,
  AgentReviewRepository as AgentReviewRepositoryClass,
  ReviewOwnershipRepository as ReviewOwnershipRepositoryClass,
  ReviewSyncStateRepository as ReviewSyncStateRepositoryClass,
  SlackChannelLinkRepository as SlackChannelLinkRepositoryClass,
  SlackTriageItemRepository as SlackTriageItemRepositoryClass,
  ClaudeUsageRepository as ClaudeUsageRepositoryClass,
  ProjectFileMetadataRepository as ProjectFileMetadataRepositoryClass,
  ScheduledLoopRepository as ScheduledLoopRepositoryClass,
  LoopRunRepository as LoopRunRepositoryClass,
  PlaybookRepository as PlaybookRepositoryClass,
} from './repositories/impl';
import type { IFileSystem, IPathUtils } from './repositories/impl/ProjectRepository';

/**
 * Configuration options for creating a repository container
 */
export interface ContainerConfig {
  database: Database;
  userDataPath: string;
  fileSystem?: IFileSystem;
  pathUtils?: IPathUtils;
}

/**
 * Create a repository container with all dependencies wired up.
 *
 * For production use:
 * ```ts
 * const container = createRepositoryContainer({
 *   database: getDatabase(),
 *   userDataPath: getUserDataPath(),
 * });
 * ```
 *
 * For testing:
 * ```ts
 * const container = createRepositoryContainer({
 *   database: createTestDatabase(),
 *   userDataPath: '/tmp/test',
 *   fileSystem: mockFileSystem,
 *   pathUtils: mockPath,
 * });
 * ```
 */
export function createRepositoryContainer(config: ContainerConfig): IRepositoryContainer {
  const { database, userDataPath } = config;

  // Use real implementations by default, allow mocks for testing
  const fileSystem: IFileSystem = config.fileSystem ?? {
    existsSync: (...args) => fs.existsSync(...args),
    mkdirSync: (...args) => fs.mkdirSync(...args),
    writeFileSync: (...args) => fs.writeFileSync(...args),
    rmSync: (...args) => fs.rmSync(...args),
    lstatSync: (...args) => fs.lstatSync(...args),
    readlinkSync: (...args) => fs.readlinkSync(...args),
    unlinkSync: (...args) => fs.unlinkSync(...args),
    symlinkSync: (...args) => fs.symlinkSync(...args),
  };

  const pathUtils: IPathUtils = config.pathUtils ?? {
    join: (...paths) => path.join(...paths),
  };

  // Create repository instances
  const planItems = new PlanItemRepositoryClass(database);

  return {
    projects: new ProjectRepositoryClass(database, userDataPath, fileSystem, pathUtils),
    planItems,
    planRelations: new PlanRelationRepositoryClass(database),
    groups: new GroupRepositoryClass(database),
    repos: new RepoRepositoryClass(database),
    attachments: new AttachmentRepositoryClass(database),
    tracker: new TrackerRepositoryClass(database),
    sync: new SyncRepositoryClass(database),
    syncQueue: new SyncQueueRepositoryClass(database),
    typeMappings: new TypeMappingRepositoryClass(database),
    externalPlanItems: new ExternalPlanItemRepositoryClass(database, planItems),
    chatMessages: new ChatMessageRepositoryClass(database),
    chatSessions: new ChatSessionRepositoryClass(database),
    taskPromptTemplates: new TaskPromptTemplateRepositoryClass(database),
    customPrompts: new CustomPromptRepositoryClass(database),
    appSettings: new AppSettingsRepositoryClass(database),
    customThemes: new CustomThemeRepositoryClass(database),
    devSessions: new DevSessionRepositoryClass(database),
    confluenceLinks: new ConfluenceLinkRepositoryClass(database),
    toolPermissions: new ToolPermissionRepositoryClass(database),
    reviewTasks: new ReviewTaskRepositoryClass(database),
    agentReviews: new AgentReviewRepositoryClass(database),
    reviewOwnership: new ReviewOwnershipRepositoryClass(database),
    reviewSyncState: new ReviewSyncStateRepositoryClass(database),
    slackChannelLinks: new SlackChannelLinkRepositoryClass(database),
    slackTriageItems: new SlackTriageItemRepositoryClass(database),
    claudeUsage: new ClaudeUsageRepositoryClass(database),
    projectFileMetadata: new ProjectFileMetadataRepositoryClass(database),
    scheduledLoops: new ScheduledLoopRepositoryClass(database),
    loopRuns: new LoopRunRepositoryClass(database),
    playbooks: new PlaybookRepositoryClass(database),
  };
}

/**
 * Singleton instance for production use.
 * Must be initialized explicitly at app startup.
 */
let _container: IRepositoryContainer | null = null;

/**
 * Initialize the singleton repository container for production use.
 * Returns the existing instance if already initialized.
 */
export function initializeRepositoryContainer(): IRepositoryContainer {
  if (!_container) {
    _container = createRepositoryContainer({
      database: getDatabase(),
      userDataPath: getUserDataPath(),
    });
  }
  return _container;
}

/**
 * Get the singleton repository container for production use.
 *
 * @throws Error if called before app startup initialization
 */
export function getRepositoryContainer(): IRepositoryContainer {
  if (!_container) {
    throw new Error(
      'Repository container not initialized. Call initializeRepositoryContainer() at app startup.'
    );
  }
  return _container;
}
