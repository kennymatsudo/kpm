/**
 * Development Domain Repository Interfaces
 *
 * Interfaces for dev sessions and git worktrees.
 */

import type {
  DevSession,
  DevSessionStatus,
  DevSessionWithPlanItem,
  Worktree,
} from '../../../shared/types';

// =============================================================================
// Dev Session Repository
// =============================================================================

export interface IDevSessionRepository {
  /** Get a session by ID */
  get(id: string): DevSession | undefined;
  /** Get all sessions for a project */
  getByProject(projectId: string): DevSession[];
  /** Get sessions with plan item data for display */
  getByProjectWithPlanItems(projectId: string): DevSessionWithPlanItem[];
  /** Get non-inactive sessions (pending or active) for a project */
  getActiveSessions(projectId: string): DevSession[];
  /** Get session for a plan item (if any active) */
  getByPlanItem(planItemId: string): DevSession | undefined;
  /** Get non-inactive session for a plan item */
  getActiveByPlanItem(planItemId: string): DevSession | undefined;
  /** Create a new session */
  create(session: Omit<DevSession, 'created_at' | 'updated_at' | 'completed_at'>): DevSession;
  /** Update session status */
  updateStatus(id: string, status: DevSessionStatus): void;
  /** Delete a session */
  delete(id: string): void;
  /** Mark all active sessions as inactive (called on app startup) */
  markActiveAsInactive(): void;
}

// =============================================================================
// Worktree Repository
// =============================================================================

export interface IWorktreeRepository {
  /** Get all worktrees for a project */
  getByProject(projectId: string): Worktree[];
  /** Get a worktree by ID */
  get(id: string): Worktree | undefined;
  /** Get worktree for a specific plan item */
  getByPlanItem(planItemId: string): Worktree | undefined;
  /** Create a new worktree record */
  create(worktree: Omit<Worktree, 'created_at' | 'last_opened_at'>): Worktree;
  /** Update last_opened_at timestamp */
  updateLastOpened(id: string): void;
  /** Delete a worktree record */
  delete(id: string): void;
}
