/**
 * Shared factual derivation for Review Threads.
 *
 * `attention` describes states that need the user to intervene (the board dot).
 * `work` describes the broader queue of review work. Keeping these projections
 * explicit prevents a new thread to assess from being mistaken for an attention
 * failure while centralizing their common session/open-thread/task eligibility.
 */

import type {
  PrReviewSnapshot,
  PrReviewThread,
  ReviewActionableSummary,
  ReviewTask,
} from './types';

export interface ReviewThreadSummaryInput {
  snapshot: PrReviewSnapshot | null | undefined;
  tasks: readonly ReviewTask[];
}

export interface ReviewWorkFacts {
  queueCount: number;
  openThreadCount: number;
  closedThreadCount: number;
  needsReviewCount: number;
  implementCount: number;
  inProgressImplCount: number;
  readyToPostTasks: ReviewTask[];
  needsInputCount: number;
  failedCount: number;
  staleCount: number;
  assessableCount: number;
  queuedCodeCount: number;
  updatingCodeCount: number;
  retryableAttentionTaskIds: string[];
}

export interface ReviewThreadSummary {
  attention: ReviewActionableSummary;
  work: ReviewWorkFacts;
}

export function isReviewThreadClosed(thread: PrReviewThread): boolean {
  return thread.isResolved || thread.isOutdated;
}

function isReviewTaskOpen(task: ReviewTask): boolean {
  return task.status !== 'done' && task.internal_state !== 'ignored';
}

export function isReviewWorkTask(task: ReviewTask): boolean {
  if (!isReviewTaskOpen(task)) return false;
  if (task.error || task.internal_state === 'failed' || task.internal_state === 'stale') return true;
  if (task.disposition === 'needs_user_input') return true;
  if (task.status === 'needs_review' || task.status === 'ready_to_post') return true;
  if (task.status === 'in_progress') return task.disposition === 'implement';
  return task.status === 'assessed' && task.disposition === 'implement';
}

function isReviewTaskAssessable(task: ReviewTask): boolean {
  return isReviewTaskOpen(task)
    && (task.status === 'needs_review' || task.status === 'assessed' || task.status === 'ready_to_post');
}

export function isReviewTaskQueuedForCode(task: ReviewTask): boolean {
  return task.status === 'in_progress' && task.internal_state === 'implementation_queued';
}

export function isReviewTaskUpdatingCode(task: ReviewTask): boolean {
  return task.status === 'in_progress' && task.disposition === 'implement';
}

function isRetryableAttentionTask(task: ReviewTask): boolean {
  return isReviewTaskAssessable(task)
    && (task.internal_state === 'failed' || task.internal_state === 'stale' || task.error != null);
}

export function summarizeReviewThreads(
  sessionId: string,
  input: ReviewThreadSummaryInput
): ReviewThreadSummary {
  const openThreads = input.snapshot?.threads.filter((thread) => !isReviewThreadClosed(thread)) ?? [];
  const closedThreads = input.snapshot?.threads.filter(isReviewThreadClosed) ?? [];
  const openThreadIds = input.snapshot
    ? new Set(openThreads.map((thread) => thread.id))
    : null;
  const openSessionTasks = input.tasks.filter((task) =>
    task.session_id === sessionId
      && isReviewTaskOpen(task)
      && (openThreadIds == null || openThreadIds.has(task.thread_id))
  );

  const attentionCounts = { needsInput: 0, failed: 0, stale: 0, errored: 0 };
  for (const task of openSessionTasks) {
    if (task.disposition === 'needs_user_input') attentionCounts.needsInput++;
    else if (task.internal_state === 'failed') attentionCounts.failed++;
    else if (task.internal_state === 'stale') attentionCounts.stale++;
    else if (task.error != null) attentionCounts.errored++;
  }

  const reviewWorkTasks = openSessionTasks.filter(isReviewWorkTask);
  const reviewWorkThreadIds = new Set(reviewWorkTasks.map((task) => task.thread_id));
  const queueCount = input.snapshot
    ? openThreads.filter((thread) => reviewWorkThreadIds.has(thread.id)).length
    : reviewWorkThreadIds.size;

  return {
    attention: {
      sessionId,
      hasActionable: Object.values(attentionCounts).some((count) => count > 0),
      counts: attentionCounts,
    },
    work: {
      queueCount,
      openThreadCount: openThreads.length,
      closedThreadCount: closedThreads.length,
      needsReviewCount: openSessionTasks.filter((task) => task.status === 'needs_review').length,
      implementCount: openSessionTasks.filter((task) =>
        task.disposition === 'implement' && (task.status === 'assessed' || task.status === 'needs_review')
      ).length,
      inProgressImplCount: openSessionTasks.filter((task) =>
        task.status === 'in_progress' && task.disposition === 'implement'
      ).length,
      readyToPostTasks: openSessionTasks.filter((task) => task.status === 'ready_to_post'),
      needsInputCount: openSessionTasks.filter((task) => task.disposition === 'needs_user_input').length,
      failedCount: openSessionTasks.filter((task) =>
        task.internal_state === 'failed' || task.error != null
      ).length,
      staleCount: openSessionTasks.filter((task) => task.internal_state === 'stale').length,
      assessableCount: openSessionTasks.filter(isReviewTaskAssessable).length,
      queuedCodeCount: openSessionTasks.filter(isReviewTaskQueuedForCode).length,
      updatingCodeCount: openSessionTasks.filter(isReviewTaskUpdatingCode).length,
      retryableAttentionTaskIds: openSessionTasks
        .filter(isRetryableAttentionTask)
        .map((task) => task.id),
    },
  };
}
