import type { ReviewAssessmentOptions } from '../stores/devSessions/helpers';

export function getReviewInbox(sessionId: string) {
  return window.api.review.getInbox(sessionId);
}

export function refreshSessionReviewInbox(sessionId: string) {
  return window.api.review.refreshSession(sessionId);
}

export function assignSessionReviewOwnership(sessionId: string) {
  return window.api.review.assignOwnership(sessionId);
}

export function assessSessionReviewThreads(sessionId: string, options?: ReviewAssessmentOptions) {
  return window.api.review.assessThreads(sessionId, options);
}

export function draftSessionPostImplReplies(sessionId: string) {
  return window.api.review.draftPostImplReplies(sessionId);
}

export function triggerSessionReviewAutomation(sessionId: string, taskIds?: string[]) {
  return window.api.review.triggerAutomation(sessionId, taskIds);
}

export function replyToSessionReviewThread(
  sessionId: string,
  threadId: string,
  body: string,
  resolve?: boolean
) {
  return window.api.review.replyToThread(sessionId, threadId, body, resolve);
}

export function resolveSessionReviewThread(sessionId: string, threadId: string) {
  return window.api.review.resolveThread(sessionId, threadId);
}

export function unresolveSessionReviewThread(sessionId: string, threadId: string) {
  return window.api.review.unresolveThread(sessionId, threadId);
}

export function ignoreSessionReviewTask(taskId: string) {
  return window.api.review.ignoreTask(taskId);
}

export function overrideSessionReviewDisposition(taskId: string, disposition: string) {
  return window.api.review.overrideDisposition(taskId, disposition);
}

import type { ReviewActionableSummary } from '../../shared/types';

export function subscribeToReviewActionable(
  callback: (summary: ReviewActionableSummary) => void,
): () => void {
  return window.api.review.onActionableChanged(callback);
}
