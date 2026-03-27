/**
 * Review Workflow Repository Interfaces
 *
 * Persistence contracts for GitHub review ownership, task lifecycle, and sync state.
 */

import type {
  ReviewDisposition,
  ReviewOwnership,
  ReviewSyncState,
  ReviewTask,
  ReviewTaskInternalState,
  ReviewTaskPriority,
  ReviewTaskSource,
  ReviewTaskStatus,
} from '../../../shared/types';

export interface ReviewTaskUpsert {
  id?: string;
  project_id: string;
  repo_id: string;
  session_id: string;
  pr_number: number;
  thread_id: string;
  thread_url: string;
  path: string | null;
  line: number | null;
  source: ReviewTaskSource;
  status: ReviewTaskStatus;
  internal_state?: ReviewTaskInternalState | null;
  disposition?: ReviewDisposition | null;
  rationale?: string | null;
  draft_reply?: string | null;
  priority: ReviewTaskPriority;
  title: string;
  latest_comment_preview: string | null;
  last_seen_comment_id: string | null;
  last_seen_updated_at: string;
  last_agent_run_at?: string | null;
  last_posted_reply_id?: string | null;
  error?: string | null;
  completed_at?: string | null;
}

export interface ReviewTaskStatusUpdate {
  error?: string | null;
  internal_state?: ReviewTaskInternalState | null;
  disposition?: ReviewDisposition | null;
  rationale?: string | null;
  draft_reply?: string | null;
  last_agent_run_at?: string | null;
  last_posted_reply_id?: string | null;
  completed_at?: string | null;
}

export interface ReviewSyncStateUpsert {
  repo_id: string;
  pr_number: number;
  session_id: string | null;
  last_fetched_at: string | null;
  last_successful_fetched_at: string | null;
  last_head_oid: string | null;
  last_review_decision: ReviewSyncState['last_review_decision'];
  last_error?: string | null;
}

export interface IReviewTaskRepository {
  get(id: string): ReviewTask | undefined;
  getByRepoPr(repoId: string, prNumber: number): ReviewTask[];
  upsertTask(task: ReviewTaskUpsert): ReviewTask;
  updateStatus(id: string, status: ReviewTaskStatus, meta?: ReviewTaskStatusUpdate): ReviewTask | undefined;
  markResolvedByThread(repoId: string, prNumber: number, threadId: string): void;
}

export interface IReviewOwnershipRepository {
  get(repoId: string, prNumber: number): ReviewOwnership | undefined;
  set(repoId: string, prNumber: number, sessionId: string): ReviewOwnership;
}

export interface IReviewSyncStateRepository {
  get(repoId: string, prNumber: number): ReviewSyncState | undefined;
  upsert(state: ReviewSyncStateUpsert): ReviewSyncState;
  updateError(repoId: string, prNumber: number, error: string | null): ReviewSyncState | undefined;
}
