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
  WorktreeRepository as WorktreeRepositoryClass,
  AppSettingsRepository as AppSettingsRepositoryClass,
  DevSessionRepository as DevSessionRepositoryClass,
  ConfluenceLinkRepository as ConfluenceLinkRepositoryClass,
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
    worktrees: new WorktreeRepositoryClass(database),
    appSettings: new AppSettingsRepositoryClass(database),
    devSessions: new DevSessionRepositoryClass(database),
    confluenceLinks: new ConfluenceLinkRepositoryClass(database),
  };
}

/**
 * Singleton instance for production use.
 */
let _container: IRepositoryContainer | null = null;

/**
 */
  if (!_container) {
    _container = createRepositoryContainer({
      database: getDatabase(),
      userDataPath: getUserDataPath(),
    });
  }
  return _container;
}
