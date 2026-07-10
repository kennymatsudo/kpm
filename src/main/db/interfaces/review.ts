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
import type { AgentType, PersistedAgentReview } from '../../../shared/agent-types';

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
  last_pr_updated_at?: string | null;
  probe_digest?: string | null;
}

export interface PersistedAgentReviewUpsert {
  implementation_session_id: string;
  review_session_id: string;
  reviewer_agent: PersistedAgentReview['reviewer_agent'];
  diff_fingerprint?: string | null;
  raw_output?: string | null;
  findings: PersistedAgentReview['findings'];
  step_id?: string | null;
  run_index?: number | null;
}

export interface PersistedAgentReviewStart {
  implementation_session_id: string;
  review_session_id: string;
  reviewer_agent: PersistedAgentReview['reviewer_agent'];
  diff_fingerprint?: string | null;
  step_id?: string | null;
  run_index?: number | null;
}

export interface PersistedAgentReviewFailure {
  implementation_session_id: string;
  review_session_id: string;
  reviewer_agent: PersistedAgentReview['reviewer_agent'];
  diff_fingerprint?: string | null;
  raw_output?: string | null;
  error: string;
  step_id?: string | null;
  run_index?: number | null;
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

export interface IAgentReviewRepository {
  persistStartedReview(review: PersistedAgentReviewStart): PersistedAgentReview;
  persistCompletedReview(review: PersistedAgentReviewUpsert): PersistedAgentReview;
  persistFailedReview(review: PersistedAgentReviewFailure): PersistedAgentReview;
  getLatestByImplementationSessionIds(sessionIds: string[]): PersistedAgentReview[];
  /** Latest persisted row for each concrete review runtime id (fan-out reconstruction). */
  getByReviewSessionIds(reviewSessionIds: string[]): PersistedAgentReview[];
  /**
   * For each implementation session, the distinct reviewer agents that have
   * completed at least one review (including runs later marked stale). Use
   * this to answer "has agent X reviewed this session at any point?" — robust
   * to re-reviews that would overwrite `latest_agent_review.reviewer_agent`.
   */
  getReviewerAgentsByImplementationSessionIds(sessionIds: string[]): Map<string, AgentType[]>;
  markLatestCompletedStale(implementationSessionId: string): void;
}
