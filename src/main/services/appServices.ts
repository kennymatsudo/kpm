/**
 * Application Services Composition Root
 *
 * This module wires together all application services with their dependencies.
 * Services are created with dependency injection for testability.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import type { IRepositoryContainer } from '../db/interfaces';

// Core services
import { createPlanService } from './core/PlanService';
import { createAttachmentService } from './core/AttachmentService';
import { createRepoWatcherService } from './repo/RepoWatcherService';

// Generation services

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

  const planService = createPlanService({
    planItems: container.planItems,
    planRelations: container.planRelations,
  });

  const attachmentService = createAttachmentService({
    attachments: container.attachments,
    projects: container.projects,
    fs,
    path,
  });

    planItems: container.planItems,
  });

  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Return All Services
  // ─────────────────────────────────────────────────────────────────────────────

    // Core
    planService,
    attachmentService,

    // Repo
    repoService,
    repoWatcherService,
    worktreeService,
    devSessionService,

    // Files
    fileExplorerService,
    repoFileService,

    // Generation
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type AppServices = ReturnType<typeof createAppServices>;
