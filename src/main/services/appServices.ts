/**
 * Application Services Composition Root
 *
 * This module wires together all application services with their dependencies.
 * Services are created with dependency injection for testability.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { BrowserWindow, shell } from 'electron';
import type { IRepositoryContainer } from '../db/interfaces';
import { getDatabase, getUserDataPath } from '../db/connection';
import { createExportService, createImportService, createSyncService, createTypeMappingService, queueTrackerUpdateIfNeeded } from '../db/domain';
import type { PlanItemServiceDeps, QueueTrackerUpdateIfNeeded } from '../db/domain';
import { createPlanActionExecutor } from '../db/domain/PlanActionService';

// Core services
import { createPlanService } from './core/PlanService';
import { createAppLifecycleService } from './core/AppLifecycleService';
import { createProjectService } from './core/ProjectService';
import { createChatRuntimeService } from './core/ChatRuntimeService';
import { createContextFileService } from './core/ContextFileService';
import { createCustomPromptService } from './core/CustomPromptService';
import { createExportFacadeService } from './core/ExportFacadeService';
import { createPermissionService } from './core/PermissionService';
import { createSettingsService } from './core/SettingsService';
import { createTaskPromptTemplateService } from './core/TaskPromptTemplateService';
import { createAttachmentService } from './core/AttachmentService';
import { createGroupService } from './core/GroupService';
import { createSearchService } from './core/SearchService';
import { createTrackerService } from './core/TrackerService';
import { createRepoWatcherService } from './repo/RepoWatcherService';

// Generation services

// Prompt override service
import { createPromptOverrideService } from './core/PromptOverrideService';

// Briefing service
import { createBriefingService } from './core/BriefingService';

// MCP discovery
import { createMcpDiscoveryService } from './core/McpDiscoveryService';

// Slack triage
import { createSlackTriageService } from './core/SlackTriageService';

// Confluence services
import { createConfluenceSyncService } from './confluence';
import { unwrapOrThrow } from './result';
import { TrackerClientService } from '../trackers/TrackerClientService';
import { AnthropicAuth } from '../claude/auth';
import { clientManager } from '../claude/clientManager';
import { createRepoServices } from './composition/repoServices';
import { createGenerationServices } from './composition/generationServices';

// =============================================================================
// Application Services Factory
// =============================================================================

export function createAppServices(container: IRepositoryContainer) {
  const database = getDatabase();
  const getPrimaryWindow = () => BrowserWindow.getAllWindows()[0] ?? null;
  const broadcastToWindows = (channel: string, payload: unknown) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload);
      }
    }
  };
  const planItemServiceDeps: PlanItemServiceDeps = {
    planItems: container.planItems,
    syncQueue: container.syncQueue,
    tracker: container.tracker,
  };
  const queueTrackerUpdate: QueueTrackerUpdateIfNeeded = (item, updates, queuedBy) => {
    queueTrackerUpdateIfNeeded(item, updates, queuedBy, planItemServiceDeps);
  };
  // ─────────────────────────────────────────────────────────────────────────────
  // Repo Watcher (needed by RepoService)
  // ─────────────────────────────────────────────────────────────────────────────

  const repoWatcherService = createRepoWatcherService({
    getMainWindow: getPrimaryWindow,
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Core Services
  // ─────────────────────────────────────────────────────────────────────────────

  const planActionExecutor = createPlanActionExecutor({
    database,
    planItems: container.planItems,
    planRelations: container.planRelations,
    groups: container.groups,
    tracker: container.tracker,
    syncQueue: container.syncQueue,
    queueTrackerUpdateIfNeeded: queueTrackerUpdate,
  });

  const planService = createPlanService({
    planItems: container.planItems,
    planRelations: container.planRelations,
    queueTrackerUpdateIfNeeded: queueTrackerUpdate,
    executePlanActions: planActionExecutor.execute,
  });

  const projectService = createProjectService({
    projects: container.projects,
    openPath: (targetPath: string) => shell.openPath(targetPath),
  });

  const settingsService = createSettingsService({
    appSettings: container.appSettings,
    anthropicAuth: AnthropicAuth,
  });

  const contextFileService = createContextFileService({
    getProjectById: container.projects.get.bind(container.projects),
  });

  const customPromptService = createCustomPromptService({
    customPrompts: container.customPrompts,
    projects: container.projects,
    executeCustomPrompt,
  });

  const permissionService = createPermissionService({
    toolPermissions: container.toolPermissions,
  });

  const taskPromptTemplateService = createTaskPromptTemplateService({
    taskPromptTemplates: container.taskPromptTemplates,
  });

  const groupService = createGroupService({
    groups: container.groups,
    planItems: container.planItems,
  });

  const attachmentService = createAttachmentService({
    attachments: container.attachments,
    projects: container.projects,
    fs,
    path,
  });

  const searchService = createSearchService({
    getDatabase,
  });

  const trackerService = createTrackerService({
    tracker: container.tracker,
    clientService: TrackerClientService,
    importService: createImportService({
      tracker: container.tracker,
      externalPlanItems: container.externalPlanItems,
      sync: container.sync,
    }),
    syncService: createSyncService({
      database,
      planItems: container.planItems,
      externalPlanItems: container.externalPlanItems,
      sync: container.sync,
      tracker: container.tracker,
    }),
  });

  const exportService = createExportService({
    database,
    syncQueue: container.syncQueue,
    planItems: container.planItems,
    tracker: container.tracker,
    sync: container.sync,
    typeMappings: container.typeMappings,
    trackerClientService: TrackerClientService,
  });

  const typeMappingService = createTypeMappingService({
    typeMappings: container.typeMappings,
  });

  const exportFacadeService = createExportFacadeService({
    exportService,
    typeMappingService,
    tracker: container.tracker,
    trackerClientService: TrackerClientService,
  });

  const {
    repoService,
    worktreeService,
    fileExplorerService,
    devSessionService,
    gitHubService,
    reviewService,
    reviewAssessmentService,
    projectWatcherService,
    repoFileService,
    getProjectFolder,
  } = createRepoServices({
    container,
    repoWatcherService,
    getMainWindow: getPrimaryWindow,
    userDataPath: getUserDataPath(),
  });

  const appLifecycleService = createAppLifecycleService({
    searchService,
    devSessionService,
    disposeClaudeClients: () => clientManager.disposeAll(),
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Briefing Service
  // ─────────────────────────────────────────────────────────────────────────────

  const briefingService = createBriefingService({
    getDatabase,
    fileExplorerService,
    projects: container.projects,
  });

  const {
    onboardingService,
    artifactService,
    onboardingFacadeService,
  } = createGenerationServices({
    container,
    getProjectFolder,
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Confluence Services
  // ─────────────────────────────────────────────────────────────────────────────

  const confluenceSyncService = createConfluenceSyncService({
    confluenceLinks: container.confluenceLinks,
    projects: container.projects,
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // MCP Discovery Service
  // ─────────────────────────────────────────────────────────────────────────────

  const mcpDiscoveryService = createMcpDiscoveryService({
    appSettings: container.appSettings,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Slack Triage Service
  // ─────────────────────────────────────────────────────────────────────────


  const slackTriageService = createSlackTriageService({
    slackChannelLinks: container.slackChannelLinks,
    slackTriageItems: container.slackTriageItems,
    planItems: container.planItems,
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Return All Services
  // ─────────────────────────────────────────────────────────────────────────────

  const services = {
    // Core
    projectService,
    settingsService,
    contextFileService,
    customPromptService,
    permissionService,
    taskPromptTemplateService,
    planService,
    groupService,
    attachmentService,
    exportFacadeService,
    trackerService,
    searchService,
    appLifecycleService,

    // Repo
    repoService,
    repoWatcherService,
    worktreeService,
    devSessionService,
    gitHubService,
    reviewService,
    reviewAssessmentService,

    // Files
    fileExplorerService,
    projectWatcherService,
    repoFileService,

    // Generation
    artifactService,
    onboardingFacadeService,
    onboardingService,

    // Prompt overrides
    promptOverrideService,

    // Briefing
    briefingService,

    // Confluence
    confluenceSyncService,

    // Slack
    slackTriageService,

    // MCP
    mcpDiscoveryService,

    // Runtime factories
    createChatRuntime: (getMainWindow: () => BrowserWindow | null) => createChatRuntimeService({
      getMainWindow,
      services,
      container,
    }),
  };

  return services;
}

// =============================================================================
// Type Export
// =============================================================================

export type AppServices = ReturnType<typeof createAppServices>;
