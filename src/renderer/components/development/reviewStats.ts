/**
 * reviewStats - Shared derivation of GitHub review-queue counts.
 *
 * Lifted out of ReviewTab so the board's session-status projection
 * (`panelStatus` / `usePanelStatus`) and the Review tab compute review state
 * from one source of truth rather than re-deriving it independently.
 *
 * Pure functions only — no store or React dependency.
 */

import type { PrReviewThread, ReviewInboxSnapshot, ReviewTask } from '../../../shared/types';

export interface ReviewStats {
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

export function isThreadClosed(thread: PrReviewThread): boolean {
  return thread.isResolved || thread.isOutdated;
}

export function isTaskOpen(task: ReviewTask): boolean {
  return task.status !== 'done' && task.internal_state !== 'ignored';
}

export function isTaskActionable(task: ReviewTask): boolean {
  if (!isTaskOpen(task)) return false;
  if (task.error || task.internal_state === 'failed' || task.internal_state === 'stale') return true;
  if (task.disposition === 'needs_user_input') return true;
  if (task.status === 'needs_review' || task.status === 'ready_to_post') return true;
  if (task.status === 'in_progress') return task.disposition === 'implement';
  return task.status === 'assessed' && task.disposition === 'implement';
}

export function isReviewTaskAssessable(task: ReviewTask): boolean {
  return isTaskOpen(task)
    && (task.status === 'needs_review' || task.status === 'assessed' || task.status === 'ready_to_post');
}

export function isReviewTaskQueuedForCode(task: ReviewTask): boolean {
  return task.status === 'in_progress' && task.internal_state === 'implementation_queued';
}

export function isReviewTaskUpdatingCode(task: ReviewTask): boolean {
  return task.status === 'in_progress' && task.disposition === 'implement';
}

export function isRetryableAttentionTask(task: ReviewTask): boolean {
  return isReviewTaskAssessable(task)
    && (task.internal_state === 'failed' || task.internal_state === 'stale' || task.error != null);
}

export function getStats(inbox: ReviewInboxSnapshot | null, sessionId: string): ReviewStats {
  const snapshot = inbox?.snapshot ?? null;
  const sessionTasks = inbox?.tasks.filter((task) => task.session_id === sessionId) ?? [];
  const actionableThreadIds = new Set(openTasks.filter(isTaskActionable).map((task) => task.thread_id));
  const retryableAttentionTaskIds = openTasks.filter(isRetryableAttentionTask).map((task) => task.id);

  return {
    queueCount: snapshot?.threads.filter((thread) =>
      !isThreadClosed(thread) && actionableThreadIds.has(thread.id)
    ).length ?? actionableThreadIds.size,
    openThreadCount: snapshot?.threads.filter((thread) => !isThreadClosed(thread)).length ?? 0,
    closedThreadCount: snapshot?.threads.filter(isThreadClosed).length ?? 0,
    needsReviewCount: openTasks.filter((task) => task.status === 'needs_review').length,
    implementCount: openTasks.filter((task) =>
      task.disposition === 'implement' && (task.status === 'assessed' || task.status === 'needs_review')
    ).length,
    inProgressImplCount: openTasks.filter((task) =>
      task.status === 'in_progress' && task.disposition === 'implement'
    ).length,
    readyToPostTasks: openTasks.filter((task) => task.status === 'ready_to_post'),
    needsInputCount: openTasks.filter((task) => task.disposition === 'needs_user_input').length,
    failedCount: openTasks.filter((task) => task.internal_state === 'failed' || task.error != null).length,
    staleCount: openTasks.filter((task) => task.internal_state === 'stale').length,
    assessableCount: openTasks.filter(isReviewTaskAssessable).length,
    queuedCodeCount: openTasks.filter(isReviewTaskQueuedForCode).length,
    updatingCodeCount: openTasks.filter(isReviewTaskUpdatingCode).length,
    retryableAttentionTaskIds,
  };
}
