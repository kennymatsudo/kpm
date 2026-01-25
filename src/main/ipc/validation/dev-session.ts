/**
 * Dev Session and Worktree Validation Schemas
 */

import { z } from 'zod';
import { uuid, devSessionStatus } from './shared';

// =============================================================================
// Dev Session Schemas
// =============================================================================

export const DevSessionSchemas = {
  /** Get sessions by project */
  getByProject: z.object({
    projectId: uuid,
  }),

  /** Get sessions with plan items by project */
  getByProjectWithPlanItems: z.object({
    projectId: uuid,
  }),

  /** Get active sessions */
  getActive: z.object({
    projectId: uuid,
  }),

  /** Get session by ID */
  get: z.object({
    sessionId: uuid,
  }),

  /** Check if plan item has active session */
  hasActive: z.object({
    planItemId: uuid,
  }),

  /** Update session status */
  updateStatus: z.object({
    sessionId: uuid,
    status: devSessionStatus,
  }),

  delete: z.object({
    sessionId: uuid,
    cleanupWorktree: z.boolean().optional().default(true),
  }),

  /** Check if session has uncommitted changes */
  checkDirty: z.object({
    sessionId: uuid,
  }),

  /** Get session diff */
  getDiff: z.object({
    sessionId: uuid,
  }),

  /** Get commits ahead */
  getCommitsAhead: z.object({
    sessionId: uuid,
  }),

};

// =============================================================================
// Worktree Schemas
// =============================================================================

export const WorktreeSchemas = {
  /** Get worktrees for a project */
  getByProject: z.object({
    projectId: uuid,
  }),

  /** Get worktree for a plan item */
  getByPlanItem: z.object({
    planItemId: uuid,
  }),

  /** Launch agent for a plan item */
  launch: z.object({
    planItemId: uuid,
    repoId: uuid.optional(),
  }),

  /** Resume agent in existing worktree */
  resume: z.object({
    worktreeId: uuid,
  }),

  /** Open worktree in editor */
  openEditor: z.object({
    worktreeId: uuid,
  }),

  /** Get worktree status */
  getStatus: z.object({
    worktreeId: uuid,
  }),

  /** Delete worktree */
  delete: z.object({
    worktreeId: uuid,
    force: z.boolean().optional().default(false),
  }),

  /** Push worktree branch */
  push: z.object({
    worktreeId: uuid,
  }),
};
