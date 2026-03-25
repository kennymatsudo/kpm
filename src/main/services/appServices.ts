/**
 * Application Services Composition Root
 *
 * This module wires together all application services with their dependencies.
 * Services are created with dependency injection for testability.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import type { IRepositoryContainer } from '../db/interfaces';
import { getDatabase, getUserDataPath } from '../db/connection';
import { createPlanActionExecutor } from '../db/domain/PlanActionService';

// Core services
import { createPlanService } from './core/PlanService';
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

// Confluence services
import { createConfluenceSyncService } from './confluence';
import { unwrapOrThrow } from './result';
import { TrackerClientService } from '../trackers/TrackerClientService';

// =============================================================================
// Application Services Factory
// =============================================================================

export function createAppServices(container: IRepositoryContainer) {
  // ─────────────────────────────────────────────────────────────────────────────
  // Repo Watcher (needed by RepoService)
  // ─────────────────────────────────────────────────────────────────────────────

  const repoWatcherService = createRepoWatcherService({
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Core Services
  // ─────────────────────────────────────────────────────────────────────────────

  const planActionExecutor = createPlanActionExecutor({
    planItems: container.planItems,
    planRelations: container.planRelations,
    groups: container.groups,
    tracker: container.tracker,
    syncQueue: container.syncQueue,
  });

  const planService = createPlanService({
    planItems: container.planItems,
    planRelations: container.planRelations,
    executePlanActions: planActionExecutor.execute,
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
  });

    planItems: container.planItems,
  });

  });

  });

    getProjectFolder,
  });

  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Briefing Service
  // ─────────────────────────────────────────────────────────────────────────────

  const briefingService = createBriefingService({
    getDatabase,
    fileExplorerService,
    projects: container.projects,
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Return All Services
  // ─────────────────────────────────────────────────────────────────────────────

    // Core
    planService,
    groupService,
    attachmentService,
    trackerService,
    searchService,

    // Repo
    repoService,
    repoWatcherService,
    worktreeService,
    devSessionService,
    gitHubService,

    // Files
    fileExplorerService,
    projectWatcherService,
    repoFileService,

    // Generation

    // Prompt overrides
    promptOverrideService,

    // Briefing
    briefingService,

    // Confluence
    confluenceSyncService,

    // MCP
    mcpDiscoveryService,
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type AppServices = ReturnType<typeof createAppServices>;
