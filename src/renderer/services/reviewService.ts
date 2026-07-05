import type { ReviewActionableSummary, ReviewDisposition } from '../../shared/types';
import type { ReviewAssessmentOptions } from '../stores/devSessions/helpers';

export function getReviewInbox(payload: { sessionId: string }) {
  return window.api.review.getInbox(payload);
}

export function refreshSessionReviewInbox(payload: { sessionId: string }) {
  return window.api.review.refreshSession(payload);
}

export function assignSessionReviewOwnership(payload: { sessionId: string }) {
  return window.api.review.assignOwnership(payload);
}

export function assessSessionReviewThreads(payload: { sessionId: string } & ReviewAssessmentOptions) {
  return window.api.review.assessThreads(payload);
}

export function draftSessionPostImplReplies(payload: { sessionId: string }) {
  return window.api.review.draftPostImplReplies(payload);
}

export function triggerSessionReviewAutomation(payload: { sessionId: string; taskIds?: string[] }) {
  return window.api.review.triggerAutomation(payload);
}

export function replyToSessionReviewThread(payload: {
  sessionId: string;
  threadId: string;
  body: string;
  resolve?: boolean;
}) {
  return window.api.review.replyToThread(payload);
}

export function resolveSessionReviewThread(payload: { sessionId: string; threadId: string }) {
  return window.api.review.resolveThread(payload);
}

export function unresolveSessionReviewThread(payload: { sessionId: string; threadId: string }) {
  return window.api.review.unresolveThread(payload);
}

export function ignoreSessionReviewTask(payload: { taskId: string }) {
  return window.api.review.ignoreTask(payload);
}

export function overrideSessionReviewDisposition(payload: { taskId: string; disposition: ReviewDisposition }) {
  return window.api.review.overrideDisposition(payload);
}

export function subscribeToReviewActionable(
  callback: (summary: ReviewActionableSummary) => void,
): () => void {
  return window.api.review.onActionableChanged(callback);
}
