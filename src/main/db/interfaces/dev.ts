/**
 * Development Domain Repository Interfaces
 *
 * Interfaces for dev sessions and git worktrees.
 */

import type {
  DevSessionAutomationPhase,
  AgentExecutionMode,
  AgentReviewPolicy,
  DevSession,
  DevSessionStatus,
  DevSessionWithPlanItem,
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
  /** Update persisted automation phase for session orchestration. */
  updateAutomationPhase(id: string, phase: DevSessionAutomationPhase | null): void;
  /** Update persisted run mode/review policy for session orchestration. */
  updateWorkflowControls(id: string, executionMode: AgentExecutionMode, reviewPolicy: AgentReviewPolicy): void;
  /** Update PR tracking info on a session */
  updatePrInfo(id: string, prNumber: number, prUrl: string, prState: string, reviewState: string | null): void;
  /** Update session name */
  updateName(id: string, name: string): void;
  /** Persist the immutable fork-point SHA captured at worktree creation */
  updateBaseSha(id: string, baseSha: string): void;
  /** Update user-explicit merge order override (null = derive from plan graph) */
  updateMergeOrder(id: string, order: number | null): void;
  /** Delete a session */
  delete(id: string): void;
  /** Mark all active sessions as inactive (called on app startup) */
  markActiveAsInactive(): void;
}
