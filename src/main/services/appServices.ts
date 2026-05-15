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
import { getConfig } from '../config';
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
import { createCustomThemeService } from './core/CustomThemeService';
import { createTaskPromptTemplateService } from './core/TaskPromptTemplateService';
import { createAttachmentService } from './core/AttachmentService';
import { createGroupService } from './core/GroupService';
import { createSearchService } from './core/SearchService';
import { createTrackerService } from './core/TrackerService';
import { createRepoWatcherService } from './repo/RepoWatcherService';
import { createPollScheduler } from './core/PollScheduler';
import { createUpdateEventBus } from './core/UpdateEventBus';
import { createNotificationService } from './core/NotificationService';

// Generation services
import { executeCustomPrompt, setCustomPromptUsageRecorder } from './generation/CustomPromptGenerationService';

// Streaming services
import { createTerminalService } from './streaming/TerminalService';

// Prompt override service
import { createPromptOverrideService } from './core/PromptOverrideService';

// Briefing service
import { createBriefingService } from './core/BriefingService';

// MCP discovery
import { createMcpDiscoveryService } from './core/McpDiscoveryService';

// Slack triage
import { createSlackTriageService } from './core/SlackTriageService';
import { createSlackTriageAdapter } from './core/slackTriageAdapter';

// Claude usage tracking
import { createClaudeUsageService } from './core/ClaudeUsageService';

// Confluence services
import { createConfluenceSyncService } from './confluence';
import { unwrapOrThrow } from './result';
import { TrackerClientService } from '../trackers/TrackerClientService';
import { AnthropicAuth } from '../claude/auth';
import { clientManager } from '../claude/clientManager';
import { createRepoServices } from './composition/repoServices';
import { createGenerationServices } from './composition/generationServices';
import { createFileSummaryService } from './files/FileSummaryService';
import { createAgentSessionManager } from './agents/AgentSessionManager';
import { createHookServer } from './agents/hookServer';
import { createBoardAgentOrchestrator } from './agents/BoardAgentOrchestrator';
import { createReviewPollService } from './repo/ReviewPollService';

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

  // Prompt overrides — created early so any service or callback below can resolve
  // configurable prompts via `getPromptContent`.
  const promptOverrideService = createPromptOverrideService({
    appSettings: container.appSettings,
  });
  const getPromptContent = (key: string) => unwrapOrThrow(promptOverrideService.getContent(key));
  const planItemServiceDeps: PlanItemServiceDeps = {
    planItems: container.planItems,
    syncQueue: container.syncQueue,
    tracker: container.tracker,
  };
  const queueTrackerUpdate: QueueTrackerUpdateIfNeeded = (item, updates, queuedBy) => {
    queueTrackerUpdateIfNeeded(item, updates, queuedBy, planItemServiceDeps);
  };
  let devSessionServiceRef: ReturnType<typeof createRepoServices>['devSessionService'] | null = null;

  const requestPlanRefresh = (projectId: string) => {
    broadcastToWindows('plan:refresh-requested', { projectId });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Cross-cutting Infrastructure (scheduler + event bus + notifications)
  //
  // Created early so any downstream service can register pollers or subscribe
  // to update events without reaching back through the composition root.
  // ─────────────────────────────────────────────────────────────────────────────

  const pollScheduler = createPollScheduler();
  const updateEventBus = createUpdateEventBus();
  const notificationService = createNotificationService({
    bus: updateEventBus,
    broadcastToWindows,
  });
  notificationService.start();

  // Embedded developer terminal panel PTY manager. Distinct from agent PTYs
  // (CliAgentSession) — this is the user-driven shell exposed via Cmd+`.
  const terminalService = createTerminalService();

  // Centralized Claude usage tracking — every Claude SDK call site funnels
  // tokens + cost through this service. Created early so downstream services
  // (chat runtime, board agents, briefing, etc.) can record into it.
  const claudeUsageService = createClaudeUsageService({
    claudeUsage: container.claudeUsage,
    projects: container.projects,
    getMainWindow: getPrimaryWindow,
  });

  // Wire the (singleton) custom prompt generation service into the central
  // tracker. The function-level helper predates DI in this area, so we set
  // the recorder globally rather than threading deps through executeCustomPrompt.
  setCustomPromptUsageRecorder(({ projectId, source, model, usage, totalCostUsd }) => {
    claudeUsageService.recordUsage({ projectId, source, model, usage, totalCostUsd });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Repo Watcher (needed by RepoService)
  // ─────────────────────────────────────────────────────────────────────────────

  const repoWatcherService = createRepoWatcherService({
    getMainWindow: getPrimaryWindow,
    eventBus: updateEventBus,
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
    appSettings: container.appSettings,
    openPath: (targetPath: string) => shell.openPath(targetPath),
  });

  const settingsService = createSettingsService({
    appSettings: container.appSettings,
    anthropicAuth: AnthropicAuth,
  });

  const customThemeService = createCustomThemeService({
    customThemes: container.customThemes,
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Agent Session Manager + Hook Server (created early — needed by DevSessionService)
  // ─────────────────────────────────────────────────────────────────────────────

  const hookServer = createHookServer();
  let agentSessionManagerRef: ReturnType<typeof createAgentSessionManager> | null = null;
  const boardAgentOrchestrator = createBoardAgentOrchestrator({
    agentReviews: container.agentReviews,
    planService,
    getDevSessionService: () => devSessionServiceRef,
    getAgentSessionManager: () => {
      if (!agentSessionManagerRef) {
        throw new Error('Agent session manager is not initialized');
      }
      return agentSessionManagerRef;
    },
    getPromptContent,
    claudeUsageService,
    requestPlanRefresh,
  });

  const agentSessionManager = createAgentSessionManager({
    getMainWindow: getPrimaryWindow,
    ...boardAgentOrchestrator,
  });
  agentSessionManagerRef = agentSessionManager;

  // Wire hook server events to agent session manager
  hookServer.onHookEvent((sessionId, hookEvent) => {
    agentSessionManager.handleHookEvent(sessionId, hookEvent);
  });

  // Start hook server asynchronously (non-blocking — CLI agents won't work until it's ready)
  void hookServer.start().then(() => {
    agentSessionManager.setHookPort(hookServer.port);
    console.log(`[AppServices] Hook server ready on port ${hookServer.port}`);
  }).catch((err) => {
    console.error('[AppServices] Failed to start hook server:', err);
  });

  const fileSummaryService = createFileSummaryService({
    repository: container.projectFileMetadata,
    recordUsage: ({ projectId, model, usage, totalCostUsd }) => {
      claudeUsageService.recordUsage({
        projectId,
        source: 'file-summary',
        model,
        usage,
        totalCostUsd,
      });
    },
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
    agentSessionManager,
    getPromptContent,
    claudeUsageService,
    fileSummaryService,
  });
  devSessionServiceRef = devSessionService;

  // ─────────────────────────────────────────────────────────────────────────────
  // Review Poll Service (background polling for PR comments)
  // ─────────────────────────────────────────────────────────────────────────────

  const reviewPollService = createReviewPollService({
    projects: container.projects,
    devSessions: container.devSessions,
    planItems: container.planItems,
    reviewTasks: container.reviewTasks,
    reviewSyncState: container.reviewSyncState,
    reviewService,
    reviewAssessmentService,
    devSessionService,
    gitHubService,
    agentSessionManager,
    broadcastToWindows,
    scheduler: pollScheduler,
    eventBus: updateEventBus,
  });

  if (getConfig().reviewPoll.enabled) {
    reviewPollService.start();
    console.log('[AppServices] Review poll service started');
  }

  const appLifecycleService = createAppLifecycleService({
    searchService,
    devSessionService,
    pollScheduler,
    repoWatcherService,
    projectWatcherService,
    notificationService,
    terminalService,
    agentSessionManager,
    hookServer,
    fileSummaryService,
    disposeClaudeClients: () => clientManager.disposeAll(),
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Briefing Service
  // ─────────────────────────────────────────────────────────────────────────────

  const briefingService = createBriefingService({
    getDatabase,
    getPromptContent,
    fileExplorerService,
    projects: container.projects,
    recordUsage: ({ projectId, model, usage, totalCostUsd }) => {
      claudeUsageService.recordUsage({
        projectId,
        source: 'briefing',
        model,
        usage,
        totalCostUsd,
      });
    },
  });

  const {
    onboardingService,
    artifactService,
    onboardingFacadeService,
  } = createGenerationServices({
    container,
    getProjectFolder,
    claudeUsageService,
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Confluence Services
  // ─────────────────────────────────────────────────────────────────────────────

  const confluenceSyncService = createConfluenceSyncService({
    confluenceLinks: container.confluenceLinks,
    projects: container.projects,
    planItems: container.planItems,
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

  const slackAdapter = createSlackTriageAdapter({
    projects: container.projects,
    planItems: container.planItems,
    mcpDiscoveryService,
    queueTrackerUpdate,
    recordUsage: ({ projectId, source, model, usage, totalCostUsd }) => {
      claudeUsageService.recordUsage({ projectId, source, model, usage, totalCostUsd });
    },
  });

  const slackTriageService = createSlackTriageService({
    slackChannelLinks: container.slackChannelLinks,
    slackTriageItems: container.slackTriageItems,
    planItems: container.planItems,
    resolveSlackChannel: slackAdapter.resolveSlackChannel,
    getSlackAvailability: slackAdapter.getSlackAvailability,
    readSlackChannel: slackAdapter.readSlackChannel,
    readSlackThread: slackAdapter.readSlackThread,
    sendSlackMessage: slackAdapter.sendSlackMessage,
    createTaskFromTriage: slackAdapter.createTaskFromTriage,
    applyDocumentUpdate: slackAdapter.applyDocumentUpdate,
    recordUsage: ({ projectId, source, model, usage, totalCostUsd }) => {
      claudeUsageService.recordUsage({ projectId, source, model, usage, totalCostUsd });
    },
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Return All Services
  // ─────────────────────────────────────────────────────────────────────────────

  const services = {
    // Core
    projectService,
    settingsService,
    customThemeService,
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
    pollScheduler,
    updateEventBus,
    notificationService,
    terminalService,

    // Repo
    repoService,
    repoWatcherService,
    worktreeService,
    devSessionService,
    gitHubService,
    reviewService,
    reviewAssessmentService,
    reviewPollService,

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

    // Claude usage tracking
    claudeUsageService,

    // MCP
    mcpDiscoveryService,

    // Agent Sessions
    agentSessionManager,
    hookServer,

    // Repository container (escape hatch for IPC handlers that need direct
    // repository access; prefer adding a service method when possible)
    container,

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
